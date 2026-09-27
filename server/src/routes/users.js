import { Router } from "express";
import { prisma } from "../db.js";

export const usersRouter = Router();

// GET /users/search?q=
// Returns { id, displayName, avatarUrl } ONLY. Never exposes emails or friend graphs.
usersRouter.get("/users/search", async (req, res) => {
  const query = (req.query.q || "").toString().trim();
  if (!query) {
    return res.json([]);
  }

  try {
    const users = await prisma.$queryRaw`
      SELECT id, display_name AS "displayName", avatar_url AS "avatarUrl"
      FROM users
      WHERE display_name ILIKE ${"%" + query + "%"} OR email = ${query.toLowerCase()}
      ORDER BY display_name
      LIMIT 20
    `;
    return res.json(users);
  } catch (err) {
    console.error("[GET /users/search] Error:", err);
    return res.status(500).json({ error: "Failed to search users" });
  }
});
