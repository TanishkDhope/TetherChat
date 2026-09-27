import dotenv from "dotenv";
dotenv.config();

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const projectId = process.env.FIREBASE_PROJECT_ID || "connectly-9d39a";
const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;

// HARD GUARD: never allow emulator host in production
if (process.env.NODE_ENV === "production" && emulatorHost) {
  throw new Error(
    "HARD GUARD: FIREBASE_AUTH_EMULATOR_HOST is set in production environment! Refusing to start."
  );
}

if (!getApps().length) {
  if (emulatorHost) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = emulatorHost;
    initializeApp({
      projectId,
    });
    console.log(`[firebase-admin] Firebase Admin: EMULATOR mode (${emulatorHost}, project: ${projectId})`);
  } else if (serviceAccountBase64) {
    let serviceAccount;
    try {
      const trimmed = serviceAccountBase64.trim();
      if (trimmed.startsWith("{")) {
        serviceAccount = JSON.parse(trimmed);
      } else {
        const cleanB64 = trimmed.replace(/\s+/g, "");
        const decoded = Buffer.from(cleanB64, "base64").toString("utf8");
        try {
          serviceAccount = JSON.parse(decoded);
        } catch {
          const sanitized = decoded.replace(/\n/g, "\\n").replace(/\r/g, "");
          serviceAccount = JSON.parse(sanitized);
        }
      }
    } catch (err) {
      throw new Error(`Failed to parse base64 FIREBASE_SERVICE_ACCOUNT: ${err.message}`);
    }
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || projectId,
    });
    console.log(`[firebase-admin] Firebase Admin: PRODUCTION mode (project: ${serviceAccount.project_id || projectId})`);
  } else {
    initializeApp({
      projectId,
    });
    console.log(`[firebase-admin] Firebase Admin: initialized with projectId ${projectId}`);
  }
}

export const auth = getAuth();
