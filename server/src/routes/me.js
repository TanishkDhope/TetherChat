import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";

export const meRouter = Router();

// GET /me
meRouter.get("/me", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.uid },
    });
    if (!user) {
      return res.status(404).json({ error: "User profile not found. Please sync." });
    }
    return res.json(user);
  } catch (err) {
    console.error("[GET /me] Error:", err);
    return res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

const SyncSchema = z.object({
  displayName: z.string().optional(),
  avatarUrl: z.string().url().optional().nullable(),
  bio: z.string().max(300).optional().nullable(),
  statusText: z.string().max(100).optional().nullable(),
});

// POST /me/sync
// Idempotent upsert. Email strictly comes from verified token (never client body).
// Never overwrites existing displayName with an empty string.
meRouter.post("/me/sync", async (req, res) => {
  const parsed = SyncSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
  }

  const { displayName, avatarUrl, bio, statusText } = parsed.data;
  const uid = req.user.uid;
  const email = (req.user.email || `${uid}@placeholder.local`).toLowerCase();

  try {
    const existing = await prisma.user.findUnique({ where: { id: uid } });

    if (existing) {
      // Update only if provided non-empty display name
      const updatedDisplayName =
        displayName && displayName.trim().length > 0 ? displayName.trim().slice(0, 80) : existing.displayName;

      const user = await prisma.user.update({
        where: { id: uid },
        data: {
          email,
          displayName: updatedDisplayName,
          avatarUrl: avatarUrl !== undefined ? avatarUrl : existing.avatarUrl,
          bio: bio !== undefined ? bio : existing.bio,
          statusText: statusText !== undefined ? statusText : existing.statusText,
        },
      });
      return res.json(user);
    } else {
      // Create new user
      const initialDisplayName =
        displayName && displayName.trim().length > 0
          ? displayName.trim().slice(0, 80)
          : email.split("@")[0] || "User";

      const user = await prisma.user.create({
        data: {
          id: uid,
          email,
          displayName: initialDisplayName,
          avatarUrl: avatarUrl || null,
          bio: bio || null,
          statusText: statusText || null,
        },
      });
      return res.status(201).json(user);
    }
  } catch (err) {
    console.error("[POST /me/sync] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

const PatchSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  bio: z.string().max(300).optional().nullable(),
  statusText: z.string().max(100).optional().nullable(),
});

// PATCH /me
meRouter.patch("/me", async (req, res) => {
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.user.uid },
      data: parsed.data,
    });
    return res.json(user);
  } catch (err) {
    console.error("[PATCH /me] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});
