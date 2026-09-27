import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const SEED_USERS = [
  {
    id: "seed-user-alice",
    email: "alice@tetherchat.test",
    displayName: "Alice Walker",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alice",
    bio: "Lead Developer on TetherChat",
    statusText: "Migrating to PostgreSQL",
  },
  {
    id: "seed-user-bob",
    email: "bob@tetherchat.test",
    displayName: "Bob Smith",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Bob",
    bio: "Full Stack Engineer",
    statusText: "Testing real-time sockets",
  },
  {
    id: "seed-user-charlie",
    email: "charlie@tetherchat.test",
    displayName: "Charlie Brown",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie",
    bio: "DevOps & QA Specialist",
    statusText: "Checking Playwright flows",
  },
];

export async function seedDatabase(options = {}) {
  const isReset = Boolean(options.reset || process.argv.includes("--reset"));

  if (isReset) {
    console.log("[prisma/seed] --reset flag detected: purging database in strict dependency order...");
    await prisma.message.deleteMany();
    await prisma.conversationMember.deleteMany();
    await prisma.conversation.deleteMany();
    await prisma.friendship.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$executeRawUnsafe("ALTER SEQUENCE IF EXISTS messages_id_seq RESTART WITH 1;");
    console.log("[prisma/seed] Database purged and messages_id_seq restarted to 1.");
  } else {
    console.log("[prisma/seed] Running in idempotent upsert mode (no --reset).");
  }

  // 1. Users (upsert)
  for (const u of SEED_USERS) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {
        email: u.email,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        bio: u.bio,
        statusText: u.statusText,
      },
      create: u,
    });
  }
  console.log(`[prisma/seed] Upserted ${SEED_USERS.length} users.`);

  // Verify all user UIDs exist before proceeding to relational data
  const existingUsers = await prisma.user.findMany({
    select: { id: true },
  });
  const userSet = new Set(existingUsers.map((u) => u.id));
  for (const u of SEED_USERS) {
    if (!userSet.has(u.id)) {
      throw new Error(`Integrity check failed: User UID ${u.id} missing from users table!`);
    }
  }

  // 2. Friendships
  const userLoAB = "seed-user-alice" < "seed-user-bob" ? "seed-user-alice" : "seed-user-bob";
  const userHiAB = "seed-user-alice" < "seed-user-bob" ? "seed-user-bob" : "seed-user-alice";

  const userLoAC = "seed-user-alice" < "seed-user-charlie" ? "seed-user-alice" : "seed-user-charlie";
  const userHiAC = "seed-user-alice" < "seed-user-charlie" ? "seed-user-charlie" : "seed-user-alice";

  if (!isReset) {
    // Reset any temporary test friendships so seed state is strictly deterministic
    await prisma.friendship.deleteMany({
      where: {
        NOT: [
          { userLo: userLoAB, userHi: userHiAB },
          { userLo: userLoAC, userHi: userHiAC },
        ],
      },
    });
  }

  // Alice & Bob: accepted
  await prisma.friendship.upsert({
    where: { userLo_userHi: { userLo: userLoAB, userHi: userHiAB } },
    update: { status: "accepted" },
    create: {
      userLo: userLoAB,
      userHi: userHiAB,
      requestedBy: "seed-user-alice",
      status: "accepted",
      respondedAt: new Date(),
    },
  });

  // Alice & Charlie: pending (requested by Charlie)
  await prisma.friendship.upsert({
    where: { userLo_userHi: { userLo: userLoAC, userHi: userHiAC } },
    update: { status: "pending", requestedBy: "seed-user-charlie", respondedAt: null },
    create: {
      userLo: userLoAC,
      userHi: userHiAC,
      requestedBy: "seed-user-charlie",
      status: "pending",
    },
  });
  console.log("[prisma/seed] Upserted friendships (Alice-Bob accepted, Alice-Charlie pending).");

  // 3. Conversations (DM Alice-Bob)
  const dmKey = `${userLoAB}:${userHiAB}`;
  let dmConv = await prisma.conversation.findUnique({
    where: { dmKey },
  });
  if (!dmConv) {
    dmConv = await prisma.conversation.create({
      data: {
        kind: "dm",
        dmKey,
      },
    });
  }

  // Memberships for DM
  await prisma.conversationMember.upsert({
    where: { conversationId_userId: { conversationId: dmConv.id, userId: "seed-user-alice" } },
    update: {},
    create: { conversationId: dmConv.id, userId: "seed-user-alice", role: "member" },
  });
  await prisma.conversationMember.upsert({
    where: { conversationId_userId: { conversationId: dmConv.id, userId: "seed-user-bob" } },
    update: {},
    create: { conversationId: dmConv.id, userId: "seed-user-bob", role: "member" },
  });

  // Messages in DM: 4 messages (2 from each side), staggered timestamps
  const baseTime = Date.now();
  const dmSeedMessages = [
    {
      senderId: "seed-user-alice",
      body: "Hey Bob! Testing PostgreSQL migration.",
      clientMsgId: "seed-dm-1",
      createdAt: new Date(baseTime - 40000),
    },
    {
      senderId: "seed-user-bob",
      body: "Hi Alice! The messages are persistent now!",
      clientMsgId: "seed-dm-2",
      createdAt: new Date(baseTime - 30000),
    },
    {
      senderId: "seed-user-alice",
      body: "Awesome! Read receipts and presence working too.",
      clientMsgId: "seed-dm-3",
      createdAt: new Date(baseTime - 20000),
    },
    {
      senderId: "seed-user-bob",
      body: "Let's test moderated messages next.",
      clientMsgId: "seed-dm-4",
      createdAt: new Date(baseTime - 10000),
    },
  ];

  const insertedDmMessages = [];
  for (const m of dmSeedMessages) {
    let msg = await prisma.message.findFirst({
      where: { conversationId: dmConv.id, senderId: m.senderId, clientMsgId: m.clientMsgId },
    });
    if (!msg) {
      msg = await prisma.message.create({
        data: {
          conversationId: dmConv.id,
          senderId: m.senderId,
          clientMsgId: m.clientMsgId,
          kind: "text",
          body: m.body,
          createdAt: m.createdAt,
        },
      });
    }
    insertedDmMessages.push(msg);
  }

  // Set Alice's last_read_message_id on the DM to the 2nd message
  if (insertedDmMessages.length >= 2) {
    const secondMsgId = insertedDmMessages[1].id;
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: dmConv.id, userId: "seed-user-alice" } },
      data: { lastReadMessageId: secondMsgId },
    });
  }
  // Set Bob's last_read_message_id on the DM to the 4th message
  if (insertedDmMessages.length >= 4) {
    const fourthMsgId = insertedDmMessages[3].id;
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: dmConv.id, userId: "seed-user-bob" } },
      data: { lastReadMessageId: fourthMsgId },
    });
  }
  console.log("[prisma/seed] Seeded DM Alice-Bob with 4 messages and set Alice's last_read_message_id to message 2.");

  // 4. Group Conversation ('TetherChat Devs')
  let groupConv = await prisma.conversation.findFirst({
    where: { kind: "group", name: "TetherChat Devs", createdBy: "seed-user-alice" },
  });
  if (!groupConv) {
    groupConv = await prisma.conversation.create({
      data: {
        kind: "group",
        name: "TetherChat Devs",
        createdBy: "seed-user-alice",
      },
    });
  }

  // Members: Alice as owner, Bob and Charlie as members
  await prisma.conversationMember.upsert({
    where: { conversationId_userId: { conversationId: groupConv.id, userId: "seed-user-alice" } },
    update: { role: "owner" },
    create: { conversationId: groupConv.id, userId: "seed-user-alice", role: "owner" },
  });
  await prisma.conversationMember.upsert({
    where: { conversationId_userId: { conversationId: groupConv.id, userId: "seed-user-bob" } },
    update: { role: "member" },
    create: { conversationId: groupConv.id, userId: "seed-user-bob", role: "member" },
  });
  await prisma.conversationMember.upsert({
    where: { conversationId_userId: { conversationId: groupConv.id, userId: "seed-user-charlie" } },
    update: { role: "member" },
    create: { conversationId: groupConv.id, userId: "seed-user-charlie", role: "member" },
  });

  // Group messages: 2 messages (one normal, one moderated with isModerated=true & moderationReason='test-flag')
  const grpMessages = [
    {
      senderId: "seed-user-alice",
      body: "Welcome to the TetherChat Devs channel!",
      clientMsgId: "seed-grp-1",
      isModerated: false,
      moderationReason: null,
      createdAt: new Date(baseTime - 5000),
    },
    {
      senderId: "seed-user-charlie",
      body: "This message was flagged by moderation.",
      clientMsgId: "seed-grp-2",
      isModerated: true,
      moderationReason: "test-flag",
      createdAt: new Date(baseTime),
    },
  ];

  for (const m of grpMessages) {
    const existing = await prisma.message.findFirst({
      where: { conversationId: groupConv.id, senderId: m.senderId, clientMsgId: m.clientMsgId },
    });
    if (!existing) {
      await prisma.message.create({
        data: {
          conversationId: groupConv.id,
          senderId: m.senderId,
          clientMsgId: m.clientMsgId,
          kind: "text",
          body: m.body,
          isModerated: m.isModerated,
          moderationReason: m.moderationReason,
          createdAt: m.createdAt,
        },
      });
    }
  }
  console.log("[prisma/seed] Seeded 'TetherChat Devs' group with Alice (owner), Bob, Charlie, and 2 messages (including 1 moderated).");

  console.log("[prisma/seed] Seeding completed successfully.");
}

// Auto-run if executed directly via node
if (process.argv[1]?.endsWith("seed.js")) {
  seedDatabase()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error("[prisma/seed] Error during seed:", e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
