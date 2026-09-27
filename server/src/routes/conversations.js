import { Router } from "express";
import { z } from "zod";
import {
  getInbox,
  getOrCreateDm,
  createGroup,
  deleteGroup,
  getConversationMessages,
  getConversationById,
} from "../services/conversations.js";
import { emitToUser } from "../realtime.js";

export const conversationsRouter = Router();

// GET /me/conversations
conversationsRouter.get("/me/conversations", async (req, res) => {
  try {
    const inbox = await getInbox(req.user.uid);
    return res.json(inbox);
  } catch (err) {
    console.error("[GET /me/conversations] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

const DmSchema = z.object({
  otherUserId: z.string().min(1),
});

// POST /conversations/dm
conversationsRouter.post("/conversations/dm", async (req, res) => {
  const parsed = DmSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
  }

  try {
    const conversation = await getOrCreateDm(req.user.uid, parsed.data.otherUserId);
    return res.json({ id: conversation.id, kind: conversation.kind, dmKey: conversation.dm_key || conversation.dmKey });
  } catch (err) {
    console.error("[POST /conversations/dm] Error:", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

const GroupSchema = z.object({
  name: z.string().min(1).max(100),
  avatarUrl: z.string().url().optional().nullable(),
  memberIds: z.array(z.string().min(1)).optional().default([]),
});

// POST /conversations
conversationsRouter.post("/conversations", async (req, res) => {
  const parsed = GroupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
  }

  try {
    const group = await createGroup(req.user.uid, parsed.data);

    // Notify all members
    for (const memberId of parsed.data.memberIds) {
      emitToUser(memberId, "conversation:created", {
        id: group.id,
        kind: "group",
        name: group.name,
      });
    }

    return res.status(201).json(group);
  } catch (err) {
    console.error("[POST /conversations] Error:", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// DELETE /conversations/:id (owner only, cascade)
conversationsRouter.delete("/conversations/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await deleteGroup(req.user.uid, id);
    return res.json({ success: true, id });
  } catch (err) {
    console.error("[DELETE /conversations/:id] Error:", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /conversations/:id
conversationsRouter.get("/conversations/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const conv = await getConversationById(req.user.uid, id);
    return res.json(conv);
  } catch (err) {
    console.error("[GET /conversations/:id] Error:", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * Locked response shape for GET /conversations/:id/messages:
 * {
 *   "messages": [{
 *     "id": "12345",                       // string, NOT number
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
conversationsRouter.get("/conversations/:id/messages", async (req, res) => {
  const { id } = req.params;
  const { before, limit } = req.query;

  try {
    const result = await getConversationMessages(req.user.uid, id, before, limit);
    return res.json(result);
  } catch (err) {
    console.error("[GET /conversations/:id/messages] Error:", err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});
