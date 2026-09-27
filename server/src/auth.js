import { z } from "zod";
import { auth } from "./firebase.js";

const TokenPayloadSchema = z.object({
  uid: z.string().min(1),
  email: z.string().optional(),
});

/**
 * Express middleware to verify Firebase ID token from Authorization header:
 * Authorization: Bearer <ID_TOKEN>
 */
export async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: "Empty bearer token" });
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    const parsed = TokenPayloadSchema.safeParse(decoded);
    if (!parsed.success) {
      return res.status(401).json({ error: "Token payload missing valid uid" });
    }

    req.user = {
      uid: parsed.data.uid,
      email: parsed.data.email || decoded.email || null,
      token: decoded,
    };
    next();
  } catch (err) {
    console.warn(`[auth] Token verification failed: ${err.message}`);
    return res.status(401).json({ error: "Invalid or expired authentication token" });
  }
}

/**
 * Socket.IO middleware to authenticate connection using handshake token:
 * socket.handshake.auth.token
 */
export async function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error("Authentication error: missing auth.token"));
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    const parsed = TokenPayloadSchema.safeParse(decoded);
    if (!parsed.success) {
      return next(new Error("Authentication error: token missing valid uid"));
    }

    socket.data.uid = parsed.data.uid;
    socket.data.email = parsed.data.email || decoded.email || null;
    socket.data.activeCalls = new Set();
    next();
  } catch (err) {
    console.warn(`[socketAuth] Socket connection rejected: ${err.message}`);
    return next(new Error("Authentication error: invalid or expired token"));
  }
}
