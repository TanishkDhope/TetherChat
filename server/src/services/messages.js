import { prisma } from "../db.js";
import { checkToxicity } from "./moderation.js";

/**
 * Send a message in a conversation.
 * Adheres strictly to R5: Moderation is hoisted OUTSIDE the transaction.
 */
export async function sendMessage(me, { conversationId, clientMsgId, kind = "text", body }) {
  if (!body || typeof body !== "string" || !body.trim()) {
    const err = new Error("Message body is required");
    err.status = 400;
    throw err;
  }

  // 1. PRE-FLIGHT (Outside transaction):
  // 1a. Membership check
  const member = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: { conversationId, userId: me },
    },
  });
  if (!member) {
    const err = new Error("Forbidden: You are not a member of this conversation");
    err.status = 403;
    throw err;
  }

  // 1b. Moderation check via moderation.js (external HTTP call with fallback)
  let isModerated = false;
  let moderationReason = null;
  if (kind === "text") {
    try {
      const { isToxic, reason } = await checkToxicity(body);
      if (isToxic) {
        isModerated = true;
        moderationReason = reason || "This message was removed by content moderation.";
      }
    } catch (err) {
      console.error("[messages.send] Error in pre-flight content moderation:", err);
    }
  }

  // 2. SINGLE TRANSACTION (short-lived, purely in-database, no external I/O):
  const storedMessage = await prisma.$transaction(async (tx) => {
    // Insert with ON CONFLICT DO NOTHING for idempotency
    const rows = await tx.$queryRaw`
      INSERT INTO messages (conversation_id, sender_id, client_msg_id, kind, body, is_moderated, moderation_reason)
      VALUES (
        ${conversationId}::uuid,
        ${me},
        ${clientMsgId || null},
        ${kind}::"MessageKind",
        ${body},
        ${isModerated},
        ${moderationReason}
      )
      ON CONFLICT (conversation_id, sender_id, client_msg_id) DO NOTHING
      RETURNING id, conversation_id, sender_id, kind, body, is_moderated, moderation_reason, client_msg_id, created_at
    `;

    let msg = rows[0];
    if (!msg && clientMsgId) {
      // Idempotency hit: retrieve existing message
      msg = await tx.message.findFirst({
        where: { conversationId, senderId: me, clientMsgId },
      });
    }

    if (!msg) {
      throw new Error("Failed to insert or locate message");
    }

    // Bump conversation updated_at for inbox ordering
    await tx.$executeRaw`
      UPDATE conversations
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ${conversationId}::uuid
    `;

    // Bump sender's read cursor to this message
    await tx.$executeRaw`
      UPDATE conversation_members
      SET last_read_message_id = ${msg.id}
      WHERE conversation_id = ${conversationId}::uuid AND user_id = ${me}
    `;

    return msg;
  });

  // Fetch sender details for fan-out
  const sender = await prisma.user.findUnique({
    where: { id: me },
    select: { displayName: true, avatarUrl: true },
  });

  return {
    id: storedMessage.id.toString(),
    conversationId: storedMessage.conversation_id || storedMessage.conversationId,
    senderId: storedMessage.sender_id || storedMessage.senderId,
    sender: sender
      ? {
          displayName: sender.displayName,
          avatarUrl: sender.avatarUrl ?? null,
        }
      : null,
    kind: storedMessage.kind,
    body: (storedMessage.is_moderated ?? storedMessage.isModerated)
      ? "Message hidden due to content moderation"
      : storedMessage.body,
    isModerated: Boolean(storedMessage.is_moderated ?? storedMessage.isModerated),
    moderationReason: storedMessage.moderation_reason ?? storedMessage.moderationReason ?? null,
    createdAt: (storedMessage.created_at || storedMessage.createdAt).toISOString(),
  };
}

/**
 * Mark messages in a conversation as read up to messageId.
 */
export async function markRead(me, conversationId, messageId) {
  const bigId = BigInt(messageId);
  await prisma.$executeRaw`
    UPDATE conversation_members
    SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ${bigId})
    WHERE conversation_id = ${conversationId}::uuid AND user_id = ${me}
  `;
  return { conversationId, messageId: messageId.toString(), userId: me };
}
