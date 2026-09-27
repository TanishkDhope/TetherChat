import { prisma } from "../db.js";

/**
 * Send a friend request from `me` to `otherId`.
 */
export async function sendFriendRequest(me, otherId) {
  if (me === otherId) {
    const err = new Error("Cannot send friend request to yourself");
    err.status = 400;
    throw err;
  }

  // Ensure other user exists
  const targetUser = await prisma.user.findUnique({ where: { id: otherId } });
  if (!targetUser) {
    const err = new Error("Target user does not exist");
    err.status = 404;
    throw err;
  }

  const userLo = me < otherId ? me : otherId;
  const userHi = me < otherId ? otherId : me;

  const existing = await prisma.friendship.findUnique({
    where: {
      userLo_userHi: { userLo, userHi },
    },
  });

  if (existing) {
    if (existing.status === "accepted") {
      const err = new Error("Users are already friends");
      err.status = 409;
      throw err;
    }
    if (existing.status === "pending") {
      const err = new Error("Friend request is already pending");
      err.status = 409;
      throw err;
    }
  }

  return await prisma.friendship.create({
    data: {
      userLo,
      userHi,
      requestedBy: me,
      status: "pending",
    },
  });
}

/**
 * Accept a pending friend request from `otherId`.
 * Creates or gets the DM conversation deterministically inside the transaction.
 */
export async function acceptFriendRequest(me, otherId) {
  if (me === otherId) {
    const err = new Error("Cannot accept friend request from yourself");
    err.status = 400;
    throw err;
  }

  const userLo = me < otherId ? me : otherId;
  const userHi = me < otherId ? otherId : me;
  const dmKey = `${userLo}:${userHi}`;

  return await prisma.$transaction(async (tx) => {
    // 1. Update friendship to accepted
    const updated = await tx.friendship.updateMany({
      where: {
        userLo,
        userHi,
        status: "pending",
        requestedBy: otherId,
      },
      data: {
        status: "accepted",
        respondedAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      const err = new Error("No pending friend request found from this user to accept");
      err.status = 404;
      throw err;
    }

    // 2. Insert or get DM conversation
    const convRows = await tx.$queryRaw`
      INSERT INTO conversations (kind, dm_key)
      VALUES ('dm'::"ConversationKind", ${dmKey})
      ON CONFLICT (dm_key) DO UPDATE SET dm_key = EXCLUDED.dm_key
      RETURNING id, kind, dm_key, created_at, updated_at
    `;
    const conversation = convRows[0];

    // 3. Ensure both users are members
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

    return {
      status: "accepted",
      conversationId: conversation.id,
    };
  });
}

/**
 * Get all friends and pending requests for `me`, populated with user details and online presence.
 */
export async function getFriendsWithPresence(me, presenceMap) {
  const rows = await prisma.$queryRaw`
    SELECT f.user_lo, f.user_hi, f.requested_by, f.status, f.created_at, f.responded_at,
           CASE WHEN f.user_lo = ${me} THEN f.user_hi ELSE f.user_lo END AS other_id,
           CASE WHEN f.status = 'accepted' THEN 'friend'
                WHEN f.requested_by = ${me} THEN 'sent' ELSE 'received' END AS relation
    FROM friendships f
    WHERE ${me} IN (f.user_lo, f.user_hi) AND f.status <> 'blocked'
    ORDER BY f.created_at DESC
  `;

  if (rows.length === 0) return [];

  const otherIds = rows.map((r) => r.other_id);
  const users = await prisma.user.findMany({
    where: { id: { in: otherIds } },
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      statusText: true,
    },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  return rows.map((row) => {
    const user = userMap.get(row.other_id) || { id: row.other_id, displayName: "Unknown User" };
    const online = presenceMap?.has(row.other_id) && presenceMap.get(row.other_id).size > 0;
    return {
      id: row.other_id,
      relation: row.relation,
      status: row.status,
      requestedBy: row.requested_by,
      createdAt: row.created_at,
      user,
      online: Boolean(online),
    };
  });
}
