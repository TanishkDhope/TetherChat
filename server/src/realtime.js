import { socketAuth } from "./auth.js";
import { prisma } from "./db.js";
import { sendMessage, markRead } from "./services/messages.js";

// Global presence: Map<uid, Set<socketId>>
export const onlineUsersMap = new Map();

let ioInstance = null;

/**
 * Emit an event to a specific user's room ("user:<uid>").
 */
export function emitToUser(userId, event, data) {
  if (ioInstance && userId) {
    ioInstance.to(`user:${userId}`).emit(event, data);
  }
}

/**
 * Notify all friends of a user about presence changes.
 */
async function notifyFriendsPresence(uid, isOnline) {
  if (!ioInstance) return;
  try {
    const friendRows = await prisma.$queryRaw`
      SELECT CASE WHEN user_lo = ${uid} THEN user_hi ELSE user_lo END AS friend_id
      FROM friendships
      WHERE ${uid} IN (user_lo, user_hi) AND status = 'accepted'
    `;
    const eventName = isOnline ? "presence:online" : "presence:offline";
    for (const r of friendRows) {
      emitToUser(r.friend_id, eventName, { userId: uid, uid, isOnline });
    }
  } catch (err) {
    console.error(`[realtime] Error notifying friends of presence for ${uid}:`, err.message);
  }
}

/**
 * Setup Socket.IO realtime server and handlers.
 */
export function setupRealtime(io) {
  ioInstance = io;

  // 1. Authenticate every incoming socket connection using Firebase ID token
  io.use(socketAuth);

  io.on("connection", async (socket) => {
    const uid = socket.data.uid;
    console.log(`[realtime] User connected: socket=${socket.id}, uid=${uid}`);
    socket.data.activeCalls = new Set();

    // Track presence
    const wasOffline = !onlineUsersMap.has(uid) || onlineUsersMap.get(uid).size === 0;
    if (!onlineUsersMap.has(uid)) {
      onlineUsersMap.set(uid, new Set());
    }
    onlineUsersMap.get(uid).add(socket.id);

    // Join user-specific room for targeted friend/group events
    socket.join(`user:${uid}`);

    // Handlers registered synchronously

    // join-conversation
    socket.on("join-conversation", async ({ conversationId }, callback) => {
      try {
        if (!conversationId) return;
        const member = await prisma.conversationMember.findUnique({
          where: {
            conversationId_userId: { conversationId, userId: uid },
          },
        });
        if (!member) {
          if (typeof callback === "function") callback({ error: "Not a member" });
          return;
        }
        socket.join(`conversation:${conversationId}`);
        if (typeof callback === "function") callback({ ok: true });
      } catch (err) {
        console.error(`[realtime] join-conversation error for ${uid}:`, err.message);
        if (typeof callback === "function") callback({ error: err.message });
      }
    });

    // send-message
    socket.on("send-message", async (payload, callback) => {
      console.log(`[realtime] send-message from uid=${uid}, payload:`, payload);
      try {
        const { conversationId, clientMsgId, kind, body } = payload || {};
        if (!conversationId || !body) {
          if (typeof callback === "function") callback({ error: "Missing conversationId or body" });
          return;
        }

        // Send via message service (moderation hoisted outside transaction per R5)
        const messageRow = await sendMessage(uid, {
          conversationId,
          clientMsgId,
          kind: kind || "text",
          body,
        });

        // Fan out stored row to conversation room
        io.to(`conversation:${conversationId}`).emit("message", messageRow);

        if (typeof callback === "function") callback({ ok: true, message: messageRow });
      } catch (err) {
        console.error(`[realtime] send-message error for ${uid}:`, err.message);
        if (typeof callback === "function") callback({ error: err.message });
      }
    });

    // read
    socket.on("read", async ({ conversationId, messageId }) => {
      try {
        if (!conversationId || !messageId) return;
        await markRead(uid, conversationId, messageId);
        socket.to(`conversation:${conversationId}`).emit("read", {
          conversationId,
          messageId: messageId.toString(),
          userId: uid,
        });
      } catch (err) {
        console.error(`[realtime] read event error for ${uid}:`, err.message);
      }
    });

    // typing
    socket.on("typing", ({ conversationId, isTyping }) => {
      try {
        if (!conversationId) return;
        socket.to(`conversation:${conversationId}`).emit("typing", {
          conversationId,
          userId: uid,
          isTyping: Boolean(isTyping),
        });
      } catch (err) {
        console.error(`[realtime] typing event error for ${uid}:`, err.message);
      }
    });

    // WebRTC Signalling (Scoped strictly to conversation:<id>)
    socket.on("call:offer", ({ conversationId, offer }) => {
      try {
        if (!conversationId) return;
        socket.data.activeCalls.add(conversationId);
        socket.to(`conversation:${conversationId}`).emit("call:offer", {
          conversationId,
          fromUserId: uid,
          offer,
        });
      } catch (err) {
        console.error(`[realtime] call:offer error for ${uid}:`, err.message);
      }
    });

    socket.on("call:answer", ({ conversationId, answer }) => {
      try {
        if (!conversationId) return;
        socket.data.activeCalls.add(conversationId);
        socket.to(`conversation:${conversationId}`).emit("call:answer", {
          conversationId,
          fromUserId: uid,
          answer,
        });
      } catch (err) {
        console.error(`[realtime] call:answer error for ${uid}:`, err.message);
      }
    });

    socket.on("call:ice", ({ conversationId, candidate }) => {
      try {
        if (!conversationId) return;
        socket.to(`conversation:${conversationId}`).emit("call:ice", {
          conversationId,
          fromUserId: uid,
          candidate,
        });
      } catch (err) {
        console.error(`[realtime] call:ice error for ${uid}:`, err.message);
      }
    });

    socket.on("call:hangup", ({ conversationId }) => {
      try {
        if (!conversationId) return;
        socket.data.activeCalls.delete(conversationId);
        socket.to(`conversation:${conversationId}`).emit("call:hangup", {
          conversationId,
          fromUserId: uid,
        });
      } catch (err) {
        console.error(`[realtime] call:hangup error for ${uid}:`, err.message);
      }
    });

    // disconnect
    socket.on("disconnect", () => {
      // Hangup any active calls that belonged to this socket
      for (const conversationId of socket.data.activeCalls) {
        socket.to(`conversation:${conversationId}`).emit("call:hangup", {
          conversationId,
          fromUserId: uid,
        });
      }

      // Update presence
      const userSockets = onlineUsersMap.get(uid);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsersMap.delete(uid);
          notifyFriendsPresence(uid, false);
        }
      }
    });

    // Asynchronously join conversation rooms and notify friends after all handlers are attached
    (async () => {
      try {
        const memberships = await prisma.conversationMember.findMany({
          where: { userId: uid },
          select: { conversationId: true },
        });
        for (const m of memberships) {
          socket.join(`conversation:${m.conversationId}`);
        }
      } catch (err) {
        console.error(`[realtime] Error auto-joining conversation rooms for ${uid}:`, err.message);
      }

      if (wasOffline) {
        notifyFriendsPresence(uid, true);
      }
    })();
  });
}
