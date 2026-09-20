import dotenv from "dotenv";
import { checkToxicity } from "../src/services/moderation.js";

dotenv.config();

const API_KEY =
  process.env.VERCEL_AI_GATEWAY_TOKEN ||
  process.env.VERCEL_AI_GATEWAY_KEY ||
  process.env.VERCEL_API_KEY ||
  process.env.AI_GATEWAY_API_KEY ||
  process.env.TYPESAFE_API_KEY;

console.log("==================================================");
console.log("  TetherChat - Jev AI Moderation Key Validation   ");
console.log("==================================================");

if (!API_KEY) {
  console.error("❌ No Vercel AI Gateway / TypeSafe key detected!");
  console.log("\nPlease add it to your server/.env file:");
  console.log("VERCEL_AI_GATEWAY_TOKEN=your_actual_key_here\n");
  console.log("Supported variable names in server/.env:");
  console.log("  - VERCEL_AI_GATEWAY_TOKEN");
  console.log("  - VERCEL_AI_GATEWAY_KEY");
  console.log("  - VERCEL_API_KEY");
  console.log("  - TYPESAFE_API_KEY");
  process.exit(1);
}

const masked =
  API_KEY.length > 8
    ? `${API_KEY.slice(0, 4)}...${API_KEY.slice(-4)}`
    : "****";
console.log(`✅ API Key detected (${masked})`);
console.log("Testing live classification with Jev AI...\n");

async function testCases() {
  // Test Case 1: Normal friendly message
  const benignMessage = "Hey everyone, looking forward to working on this project today!";
  console.log(`1. Testing Benign Message: "${benignMessage}"`);
  const t0 = Date.now();
  const benignRes = await checkToxicity(benignMessage);
  const latency1 = Date.now() - t0;
  console.log(`   Result: isToxic = ${benignRes.isToxic}, confidence = ${benignRes.confidence} (${latency1}ms)`);
  if (!benignRes.isToxic) {
    console.log("   ✅ PASSED: Benign message not flagged.");
  } else {
    console.warn("   ⚠️ WARNING: Benign message was flagged.");
  }

  console.log("");

  // Test Case 2: Clearly toxic / abusive message
  const toxicMessage = "I hate you, you are utterly worthless, kill yourself idiot";
  console.log(`2. Testing Toxic Message: "${toxicMessage}"`);
  const t1 = Date.now();
  const toxicRes = await checkToxicity(toxicMessage);
  const latency2 = Date.now() - t1;
  console.log(`   Result: isToxic = ${toxicRes.isToxic}, confidence = ${toxicRes.confidence} (${latency2}ms)`);
  if (toxicRes.isToxic) {
    console.log("   ✅ PASSED: Toxic message successfully flagged!");
  } else {
    console.warn("   ⚠️ WARNING: Toxic message was not flagged (check model threshold or gateway response).");
  }

  console.log("\n==================================================");
  console.log("Validation complete!");
  console.log("==================================================");
}

testCases().catch((err) => {
  console.error("❌ Error during validation:", err);
  process.exit(1);
});
