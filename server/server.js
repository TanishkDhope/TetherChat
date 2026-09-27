import express from "express";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { bigintJsonReplacer } from "./src/db.js";
import { verifyFirebaseToken } from "./src/auth.js";
import { healthRouter } from "./src/routes/health.js";
import { meRouter } from "./src/routes/me.js";
import { usersRouter } from "./src/routes/users.js";
import { friendsRouter } from "./src/routes/friends.js";
import { conversationsRouter } from "./src/routes/conversations.js";
import { suggestRepliesRouter, warmSmartReplies } from "./src/routes/suggestReplies.js";
import { setupRealtime } from "./src/realtime.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

// 1. JSON BigInt serializer
app.set("json replacer", bigintJsonReplacer);

// 2. CORS configuration
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
  : ["http://localhost:5173", "http://localhost:3000"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Dev-friendly fallback
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "16kb" }));

// 3. Health check mounted BEFORE any authentication middleware (never requires token)
app.use(healthRouter);

// 4. Root endpoint (unauthenticated)
app.get("/", (req, res) => {
  res.json({ name: "TetherChat Server API", version: "1.0.0", status: "running" });
});

// 5. Authentication middleware for protected API endpoints
app.use(verifyFirebaseToken);

// 6. API Routers
app.use(meRouter);
app.use(usersRouter);
app.use(friendsRouter);
app.use(conversationsRouter);
app.use(suggestRepliesRouter);

// 7. Global error handler
app.use((err, req, res, next) => {
  console.error("[server] Unhandled error:", err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Internal server error",
  });
});

// 8. Socket.IO Realtime setup
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

setupRealtime(io);

// 9. Server listen
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`[server] TetherChat API running on port ${PORT}`);
  warmSmartReplies();
});

export { app, server, io };
