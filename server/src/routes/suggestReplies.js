import { Router } from "express";
import { z } from "zod";
import { fallbackReplies } from "../services/smartRepliesFallback.js";

// Proxy for the smart-replies model service (smart-replies/ on Cloud Run).
// Wire contract is storage-agnostic on purpose — see smart-replies/README.md.
// When the Postgres migration lands, the only change here is adding the
// verifyFirebaseToken middleware to the route.

// Read lazily: ESM hoists imports above server.js's dotenv.config() call.
const serviceUrl = () => (process.env.SMART_REPLIES_URL || "").replace(/\/+$/, "");
const timeoutMs = () => Number(process.env.SMART_REPLIES_TIMEOUT_MS) || 8000;

const SuggestRequest = z.object({
  turns: z
    .array(
      z.object({
        role: z.enum(["other", "me"]),
        text: z.string().trim().min(1).max(500),
      })
    )
    .min(1)
    .max(8),
  n: z.number().int().min(1).max(5).default(3),
});

async function fetchModelReplies(body) {
  const res = await fetch(`${serviceUrl()}/suggest-replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs()),
  });
  if (!res.ok) throw new Error(`model service responded ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.replies)) throw new Error("model service returned no replies");
  return data.replies;
}

export const suggestRepliesRouter = Router();

suggestRepliesRouter.post("/suggest-replies", async (req, res) => {
  const parsed = SuggestRequest.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid body", issues: parsed.error.issues });
  }
  const body = parsed.data;
  const started = Date.now();

  if (serviceUrl()) {
    try {
      const replies = await fetchModelReplies(body);
      const latency = Date.now() - started;
      console.log(`[smart-replies] model replied successfully in ${latency}ms`);
      return res.json({ replies, source: "model", latencyMs: latency });
    } catch (err) {
      console.warn(`[smart-replies] model service unavailable (${err.name}: ${err.message}); using fallback`);
    }
  }

  const latency = Date.now() - started;
  console.log(`[smart-replies] served rule-based fallback in ${latency}ms`);
  return res.json({
    replies: fallbackReplies(body.turns, body.n),
    source: "fallback",
    latencyMs: latency,
  });
});

// Fire-and-forget ping so a scaled-to-zero Cloud Run instance starts waking up as soon
// as the chat server boots, instead of on the first user's first message.
export function warmSmartReplies() {
  const url = serviceUrl();
  if (!url) {
    console.log("[smart-replies] SMART_REPLIES_URL not set; serving rule-based fallback only");
    return;
  }
  fetch(`${url}/health`, { signal: AbortSignal.timeout(60_000) })
    .then((r) => console.log(`[smart-replies] warm-up ${url} -> ${r.status}`))
    .catch((err) => console.warn(`[smart-replies] warm-up failed: ${err.message}`));
}
