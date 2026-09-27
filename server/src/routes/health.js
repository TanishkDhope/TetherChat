import { Router } from "express";
import { prisma } from "../db.js";

export const healthRouter = Router();

const startedAt = Date.now();

healthRouter.get("/healthz", async (req, res) => {
  const mode = process.env.FIREBASE_AUTH_EMULATOR_HOST ? "emulator" : "prod";
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({
      ok: true,
      mode,
      db: "up",
      uptime: Math.round(((Date.now() - startedAt) / 1000) * 100) / 100,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[healthz] DB connection failed:", err.message);
    return res.status(503).json({
      ok: false,
      mode,
      db: "down",
      error: err.message,
      uptime: Math.round(((Date.now() - startedAt) / 1000) * 100) / 100,
      timestamp: new Date().toISOString(),
    });
  }
});
