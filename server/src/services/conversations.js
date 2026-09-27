import { prisma } from "../db.js";

/**
 * Get or create a 1:1 DM conversation between two users deterministically.
 */
export async function getOrCreateDm(me, otherId) {
  if (me === otherId) {
    const err = new Error("Cannot create a DM with yourself");
    err.status = 400;
    throw err;
  }

  const otherUser = await prisma.user.findUnique({ where: { id: otherId } });
  if (!otherUser) {
    const err = new Error("User does not exist");
    err.status = 404;
    throw err;
  }

  const userLo = me < otherId ? me : otherId;
  const userHi = me < otherId ? otherId : me;
  const dmKey = `${userLo}:${userHi}`;

  return await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      INSERT INTO conversations (kind, dm_key)
      VALUES ('dm'::"ConversationKind", ${dmKey})
      ON CONFLICT (dm_key) DO UPDATE SET dm_key = EXCLUDED.dm_key
      RETURNING id, kind, dm_key, created_at, updated_at
    `;
    const conversation = rows[0];

    await tx.$executeRaw`
      INSERT INTO conversation_members (conversation_id, user_id, role)
      VALUES (${conversation.id}::uuid, ${userLo}, 'member'::"MemberRole")
      ON CONFLICT (conversation_id, user_id) DO NOTHING
    `;
    await tx.$executeRaw`
      INSERT INTO conversation_members (conversation_id, user_id, role)
      VALUES (${conversation.id}::uuid, ${userHi}, 'member'::"MemberRole")
      ON CONFLICT (conversation_id, user_id) DO NOTHING
    `;

    return conversation;
  });
}

/**
 * Create a group conversation.
 */
export async function createGroup(me, { name, avatarUrl, memberIds = [] }) {
  if (!name || !name.trim()) {
    const err = new Error("Group name is required");
    err.status = 400;
    throw err;
  }

  const uniqueMemberIds = Array.from(new Set([...memberIds, me]));

  return await prisma.$transaction(async (tx) => {
    const otherMembers = uniqueMemberIds.filter((id) => id !== me);
    if (otherMembers.length > 0) {
      for (const mId of otherMembers) {
        const uLo = me < mId ? me : mId;
        const uHi = me < mId ? mId : me;
        const friend = await tx.friendship.findUnique({
          where: { userLo_userHi: { userLo: uLo, userHi: uHi } },
        });
        if (!friend || friend.status !== "accepted") {
          const err = new Error(`Cannot add user ${mId} to group because they are not an accepted friend`);
          err.status = 403;
          throw err;
        }
      }
    }

    const conv = await tx.conversation.create({
      data: {
        kind: "group",
        name: name.trim(),
        avatarUrl: avatarUrl || null,
        createdBy: me,
      },
    });

    for (const userId of uniqueMemberIds) {
      await tx.conversationMember.create({
        data: {
          conversationId: conv.id,
          userId,
          role: userId === me ? "owner" : "member",
        },
      });
    }

    return conv;
  });
}

/**
 * Delete a group (owner only).
 */
export async function deleteGroup(me, conversationId) {
  const result = await prisma.$executeRaw`
    DELETE FROM conversations
    WHERE id = ${conversationId}::uuid
      AND kind = 'group'::"ConversationKind"
      AND EXISTS (
        SELECT 1 FROM conversation_members
        WHERE conversation_id = ${conversationId}::uuid
          AND user_id = ${me}
          AND role = 'owner'::"MemberRole"
      )
  `;

  if (result === 0) {
    const err = new Error("Conversation not found, not a group, or you are not the owner");
    err.status = 403;
    throw err;
  }

  return { success: true };
}

/**
 * Get user's inbox conversations ordered by updated_at DESC.
 */
export async function getInbox(me) {
  const rows = await prisma.$queryRaw`
    SELECT c.id, c.kind, c.name, c.avatar_url, c.updated_at, c.created_at,
           lm.id AS last_message_id, lm.body AS last_body, lm.kind AS last_kind, lm.created_at AS last_at,
           lm.is_moderated AS last_is_moderated,
           (SELECT count(*)::int FROM messages m
             WHERE m.conversation_id = c.id
               AND m.id > COALESCE(cm.last_read_message_id, 0)
               AND m.sender_id IS DISTINCT FROM cm.user_id) AS unread
    FROM conversation_members cm
    JOIN conversations c ON c.id = cm.conversation_id
    LEFT JOIN LATERAL (
      SELECT * FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1
    ) lm ON true
    WHERE cm.user_id = ${me}
    ORDER BY c.updated_at DESC
  `;

  const dmRows = rows.filter((r) => r.kind === "dm");
  if (dmRows.length > 0) {
    const convIds = dmRows.map((r) => r.id);
    const members = await prisma.conversationMember.findMany({
      where: {
        conversationId: { in: convIds },
        userId: { not: me },
      },
      include: {
        user: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
    });
    const dmMemberMap = new Map(members.map((m) => [m.conversationId, m.user]));
    for (const r of rows) {
      if (r.kind === "dm" && !r.name) {
        const other = dmMemberMap.get(r.id);
        if (other) {
          r.name = other.displayName;
          r.avatar_url = r.avatar_url || other.avatarUrl;
        }
      }
    }
  }

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    avatarUrl: r.avatar_url,
    updatedAt: r.updated_at,
    unreadCount: r.unread || 0,
    lastMessage: r.last_message_id
      ? {
          id: r.last_message_id.toString(),
          body: r.last_is_moderated ? "Message hidden due to content moderation" : r.last_body,
          kind: r.last_kind,
          createdAt: r.last_at,
        }
      : null,
  }));
}

/**
 * Get keyset page of messages for a conversation.
 * LOCKED RESPONSE SHAPE:
 * {
 *   "messages": [{
 *     "id": "12345",
 *     "conversationId": "uuid",
 *     "senderId": "uid",
 *     "sender": { "displayName": "Alice", "avatarUrl": "..." },
 *     "kind": "text" | "sticker",
 *     "body": "hello",
 *     "isModerated": false,
 *     "moderationReason": null,
 *     "createdAt": "2026-09-26T10:00:00.000Z"
 *   }],
 *   "hasMore": true
 * }
 */
export async function getConversationMessages(me, conversationId, before, limit = 50) {
  const member = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: { conversationId, userId: me },
    },
  });
  if (!member) {
    const err = new Error("You are not a member of this conversation");
    err.status = 403;
    throw err;
  }

  const take = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const where = { conversationId };
  if (before) {
    where.id = { lt: BigInt(before) };
  }

  const rows = await prisma.message.findMany({
    where,
    orderBy: { id: "desc" },
    take: take + 1,
    include: {
      sender: {
        select: {
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  const hasMore = rows.length > take;
  const messagesSlice = hasMore ? rows.slice(0, take) : rows;

  return {
    messages: messagesSlice.map((m) => ({
      id: m.id.toString(),
      conversationId: m.conversationId,
      senderId: m.senderId,
      sender: m.sender
        ? {
            displayName: m.sender.displayName,
            avatarUrl: m.sender.avatarUrl ?? null,
          }
        : null,
      kind: m.kind,
      body: m.isModerated ? "Message hidden due to content moderation" : m.body,
      isModerated: Boolean(m.isModerated),
      moderationReason: m.moderationReason ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
    hasMore,
  };
}

/**
 * Get details for a single conversation that the user is a member of.
 */
export async function getConversationById(me, conversationId) {
  const member = await prisma.conversationMember.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId: me,
      },
    },
  });

  if (!member) {
    const err = new Error("Conversation not found or access denied");
    err.status = 404;
    throw err;
  }

  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!conv) {
    const err = new Error("Conversation not found");
    err.status = 404;
    throw err;
  }

  let name = conv.name;
  let avatarUrl = conv.avatarUrl;
  if (conv.kind === "dm") {
    const other = conv.members.find((m) => m.userId !== me);
    if (other && other.user) {
      name = other.user.displayName;
      avatarUrl = other.user.avatarUrl;
    }
  }

  return {
    id: conv.id,
    kind: conv.kind,
    name: name || "Chat",
    avatarUrl: avatarUrl ?? null,
    dmKey: conv.dmKey ?? null,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
    members: conv.members.map((m) => ({
      userId: m.userId,
      role: m.role,
      displayName: m.user?.displayName || null,
      avatarUrl: m.user?.avatarUrl ?? null,
      email: m.user?.email || null,
    })),
  };
}
