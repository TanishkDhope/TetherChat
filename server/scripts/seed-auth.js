import dotenv from "dotenv";
dotenv.config();

// Assert emulator mode BEFORE importing firebase admin
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("Refusing to seed auth users outside emulator mode — this would create accounts in production");
  process.exit(1);
}

import { auth } from "../src/firebase.js";
import { seedDatabase, SEED_USERS } from "../prisma/seed.js";

export const SEED_AUTH_USERS = [
  {
    uid: "seed-user-alice",
    email: "alice@tetherchat.test",
    displayName: "Alice Walker",
    password: "password123",
  },
  {
    uid: "seed-user-bob",
    email: "bob@tetherchat.test",
    displayName: "Bob Smith",
    password: "password123",
  },
  {
    uid: "seed-user-charlie",
    email: "charlie@tetherchat.test",
    displayName: "Charlie Brown",
    password: "password123",
  },
];

export async function seedAuth(options = {}) {
  const isReset = Boolean(options.reset || process.argv.includes("--reset"));
  console.log(`[seed-auth] Verifying Firebase Auth Emulator at ${process.env.FIREBASE_AUTH_EMULATOR_HOST} (reset=${isReset})...`);

  for (const u of SEED_AUTH_USERS) {
    try {
      await auth.getUser(u.uid);
      await auth.updateUser(u.uid, {
        email: u.email,
        displayName: u.displayName,
        password: u.password,
      });
      console.log(`[seed-auth] Updated existing emulator user ${u.uid} (${u.email})`);
    } catch (err) {
      if (err.code === "auth/user-not-found" || err.message?.includes("user-not-found")) {
        await auth.createUser({
          uid: u.uid,
          email: u.email,
          displayName: u.displayName,
          password: u.password,
        });
        console.log(`[seed-auth] Created emulator user ${u.uid} (${u.email})`);
      } else {
        throw err;
      }
    }
  }

  console.log(`[seed-auth] Firebase Auth emulator users seeded successfully. Triggering database seed (reset=${isReset})...`);
  await seedDatabase({ reset: isReset });
  console.log("[seed-auth] Complete: Auth and Database seeded in synchronization.");
}

// Direct execution support
if (process.argv[1]?.endsWith("seed-auth.js")) {
  seedAuth()
    .then(() => {
      console.log("[seed-auth] Seed finished successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[seed-auth] Failed to seed auth users:", err);
      process.exit(1);
    });
}
