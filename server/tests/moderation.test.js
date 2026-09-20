import assert from "node:assert/strict";
import { checkToxicity } from "../src/services/moderation.js";

async function runTests() {
  console.log("Running moderation service verification tests...");

  // Test 1: Empty or null message
  const resEmpty = await checkToxicity("");
  assert.equal(resEmpty.isToxic, false, "Empty message should not be toxic");

  const resNull = await checkToxicity(null);
  assert.equal(resNull.isToxic, false, "Null message should not be toxic");

  // Test 2: Standard harmless message without API key (fail open)
  const resNormal = await checkToxicity("Hey, are you free for lunch tomorrow?");
  assert.equal(resNormal.isToxic, false, "Normal message should not be flagged");

  // Test 3: Test trigger message for development testing
  const resTestToxic = await checkToxicity("[test-toxic] this is harmful content");
  assert.equal(resTestToxic.isToxic, true, "Test toxic trigger should be flagged");
  assert.ok(resTestToxic.confidence >= 0.7, "Confidence should be high for test trigger");

  console.log("All moderation service tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
