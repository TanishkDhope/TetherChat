import { Router } from "express";
import { z } from "zod";
import { sendFriendRequest, acceptFriendRequest, getFriendsWithPresence } from "../services/friends.js";
import { onlineUsersMap, emitToUser } from "../realtime.js";

export const friendsRouter = Router();

const FriendRequestSchema = z.object({
  toUserId: z.string().min(1),
});

// POST /friends/requests
friendsRouter.post("/friends/requests", async (req, res) => {
  const parsed = FriendRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
  }

  const { toUserId } = parsed.data;
  const me = req.user.uid;

  try {
    const friendship = await sendFriendRequest(me, toUserId);

    // Notify recipient in their user:<uid> room
    emitToUser(toUserId, "friend:request", {
      fromUserId: me,
      createdAt: friendship.createdAt,
    });

    return res.status(201).json(friendship);
  } catch (err) {
    console.error("[POST /friends/requests] Error:", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /friends/requests/:otherId/accept
friendsRouter.post("/friends/requests/:otherId/accept", async (req, res) => {
  const { otherId } = req.params;
  const me = req.user.uid;

  try {
    const result = await acceptFriendRequest(me, otherId);

    // Notify requester in their user:<uid> room
    emitToUser(otherId, "friend:accepted", {
      byUserId: me,
      conversationId: result.conversationId,
    });

    return res.json(result);
  } catch (err) {
    console.error("[POST /friends/requests/:otherId/accept] Error:", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /me/friends
friendsRouter.get("/me/friends", async (req, res) => {
  const me = req.user.uid;
  try {
    const friends = await getFriendsWithPresence(me, onlineUsersMap);
    return res.json(friends);
  } catch (err) {
    console.error("[GET /me/friends] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
