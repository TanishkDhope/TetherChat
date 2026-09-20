import dotenv from "dotenv";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

dotenv.config();

// Configuration for Vercel AI Gateway / TypeSafe AI Jev
const GATEWAY_URL = process.env.VERCEL_AI_GATEWAY_URL || "https://ai-gateway.vercel.sh";
const TYPESAFE_API_URL = process.env.TYPESAFE_API_URL || "https://api.typesafe.ai";
const API_KEY =
  process.env.VERCEL_AI_GATEWAY_TOKEN ||
  process.env.VERCEL_AI_GATEWAY_KEY ||
  process.env.VERCEL_API_KEY ||
  process.env.AI_GATEWAY_API_KEY ||
  process.env.TYPESAFE_API_KEY;

// Provider using Vercel AI Gateway
let vercelGatewayProvider = null;
if (API_KEY) {
  try {
    vercelGatewayProvider = createOpenAI({
      baseURL: `${GATEWAY_URL.replace(/\/+$/, "")}/v1`,
      apiKey: API_KEY,
    });
  } catch (err) {
    console.warn("[moderation] Error initializing Vercel AI Gateway provider:", err.message);
  }
}

/**
 * Check if a chat message contains toxicity, hate speech, harassment, or spam
 * using Jev AI via Vercel AI Gateway or direct TypeSafe API.
 * 
 * @param {string} messageText 
 * @returns {Promise<{ isToxic: boolean, confidence: number, reason?: string }>}
 */
export async function checkToxicity(messageText) {
  if (!messageText || typeof messageText !== "string" || messageText.trim() === "") {
    return { isToxic: false, confidence: 0 };
  }

  const trimmedText = messageText.trim();

  // Test trigger for development and verification without requiring a live paid key:
  if (process.env.NODE_ENV !== "production") {
    if (trimmedText.startsWith("[test-toxic]") || trimmedText.toLowerCase().includes("toxic test message")) {
      console.log("[moderation] Test toxic phrase matched in non-production mode.");
      return {
        isToxic: true,
        confidence: 0.99,
        reason: "Test trigger: simulated toxicity",
      };
    }
  }

  if (!API_KEY) {
    // Fail open if no API key is configured so chat continues working smoothly
    return { isToxic: false, confidence: 0 };
  }

  // 1. Try Vercel AI Gateway via SystemOne endpoint (Jev's native API)
  try {
    const gatewayEndpoint = `${GATEWAY_URL.replace(/\/+$/, "")}/typesafe/v1/systemone`;
    const fallbackEndpoint = `${TYPESAFE_API_URL.replace(/\/+$/, "")}/v1/systemone`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2-second timeout

    let response;
    try {
      response = await fetch(gatewayEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: "jev-latest",
          state: trimmedText,
          questions: {
            is_toxic_or_spam: {
              type: "choice",
              instructions: "Is this message harmful, toxic, abusive, harassing, hate speech, or unsolicited spam?",
              criteria: {
                yes: "Contains toxicity, severe insults, hate speech, threats, harassment, scam, phishing, or advertising spam",
                no: "Benign, friendly, normal conversation, casual chat, or neutral content"
              }
            }
          }
        }),
        signal: controller.signal,
      });
    } catch (netErr) {
      // If gateway direct endpoint fails, attempt fallback endpoint
      if (TYPESAFE_API_URL && TYPESAFE_API_URL !== GATEWAY_URL) {
        response = await fetch(fallbackEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            model: "jev-latest",
            state: trimmedText,
            questions: {
              is_toxic_or_spam: {
                type: "choice",
                instructions: "Is this message harmful, toxic, abusive, harassing, hate speech, or unsolicited spam?",
                criteria: {
                  yes: "Contains toxicity, severe insults, hate speech, threats, harassment, scam, phishing, or advertising spam",
                  no: "Benign, friendly, normal conversation, casual chat, or neutral content"
                }
              }
            }
          }),
          signal: controller.signal,
        });
      } else {
        throw netErr;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (response && response.ok) {
      const data = await response.json();
      const answer = data?.answers?.is_toxic_or_spam;
      if (answer) {
        const chosen = answer.choice || answer.value;
        const isToxic = chosen === "yes" && (answer.confidence ?? 1) >= 0.7;
        return {
          isToxic,
          confidence: answer.confidence ?? 1,
          reason: isToxic ? "Flagged by Jev AI moderation" : undefined,
        };
      }
    }
  } catch (err) {
    console.warn("[moderation] SystemOne endpoint failed, attempting Vercel AI SDK generateObject:", err.message);
  }

  // 2. Fallback: Vercel AI SDK generateObject with typesafe-ai/jev model
  if (vercelGatewayProvider) {
    try {
      const { object } = await generateObject({
        model: vercelGatewayProvider("typesafe-ai/jev"),
        schema: z.object({
          isToxic: z.boolean().describe("Whether the message contains toxic content, hate speech, or spam."),
          confidence: z.number().describe("Confidence score from 0.0 to 1.0"),
        }),
        prompt: `Analyze the following chat message and determine if it is toxic or spam:\n\n"${trimmedText}"`,
        abortSignal: AbortSignal.timeout(2000),
      });

      return {
        isToxic: Boolean(object.isToxic && object.confidence > 0.7),
        confidence: object.confidence,
        reason: object.isToxic ? "Flagged by Jev AI" : undefined,
      };
    } catch (err) {
      console.warn("[moderation] Vercel AI SDK check failed:", err.message);
    }
  }

  // Fail open if all moderation calls fail/time out
  return { isToxic: false, confidence: 0 };
}
