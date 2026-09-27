import assert from "node:assert/strict";
import { io } from "socket.io-client";

const BASE_URL = "http://localhost:4000";
const EMULATOR_AUTH_URL =
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key";

async function mintToken(email, password = "password123") {
  const res = await fetch(EMULATOR_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to mint token for ${email}: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.idToken;
}

async function run() {
  console.log("==================================================================");
  console.log("PHASE 0a VERIFICATION: END-TO-END FLOW (HTTP + SOCKET.IO LAYER ONLY)");
  console.log("==================================================================");

  // 1. GET /healthz
  console.log("\n[1] Testing GET /healthz...");
  const healthRes = await fetch(`${BASE_URL}/healthz`);
  const healthBody = await healthRes.json();
  console.log(`HTTP ${healthRes.status}`);
  console.log(JSON.stringify(healthBody, null, 2));
  assert.equal(healthRes.status, 200, "healthz should return 200");
  assert.equal(healthBody.ok, true, "healthz ok should be true");
  assert.equal(healthBody.db, "up", "healthz db should be up");
  assert.equal(healthBody.mode, "emulator", "healthz mode should be emulator");

  // 2. Mint tokens
  console.log("\n[2] Minting Firebase ID tokens via emulator...");
  const aliceToken = await mintToken("alice@tetherchat.test");
  const bobToken = await mintToken("bob@tetherchat.test");
  const charlieToken = await mintToken("charlie@tetherchat.test");
  console.log("Tokens minted for Alice, Bob, and Charlie.");

  // 3. POST /me/sync (Alice)
  console.log("\n[3] Testing POST /me/sync (Alice)...");
  const syncRes = await fetch(`${BASE_URL}/me/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${aliceToken}`,
    },
    body: JSON.stringify({
      displayName: "Alice Walker",
      statusText: "PostgreSQL Migration Phase 0a verified",
    }),
  });
  const syncBody = await syncRes.json();
  console.log(`HTTP ${syncRes.status}`);
  console.log(JSON.stringify(syncBody, null, 2));
  assert.equal(syncRes.status, 200, "POST /me/sync should return 200");
  assert.equal(syncBody.id, "seed-user-alice", "User id should match seed-user-alice");

  // 4. POST /friends/requests (Bob -> Charlie)
  console.log("\n[4] Testing POST /friends/requests (Bob -> Charlie)...");
  const reqRes = await fetch(`${BASE_URL}/friends/requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bobToken}`,
    },
    body: JSON.stringify({ toUserId: "seed-user-charlie" }),
  });
  const reqBody = await reqRes.json();
  console.log(`HTTP ${reqRes.status}`);
  console.log(JSON.stringify(reqBody, null, 2));
  assert(reqRes.status === 201 || reqRes.status === 409, "POST /friends/requests should return 201 or 409");

  // 5. POST /friends/requests/:id/accept (Alice accepts Charlie)
  console.log("\n[5] Testing POST /friends/requests/:id/accept (Alice accepts Charlie)...");
  const acceptRes = await fetch(`${BASE_URL}/friends/requests/seed-user-charlie/accept`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${aliceToken}`,
    },
  });
  const acceptBody = await acceptRes.json();
  console.log(`HTTP ${acceptRes.status}`);
  console.log(JSON.stringify(acceptBody, null, 2));
  assert(acceptRes.status === 200 || acceptRes.status === 409, "POST /friends/requests/:id/accept should return 200 or 409");

  // 6. POST /conversations/dm (Alice & Bob)
  console.log("\n[6] Testing POST /conversations/dm (Alice & Bob)...");
  const dmRes = await fetch(`${BASE_URL}/conversations/dm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${aliceToken}`,
    },
    body: JSON.stringify({ otherUserId: "seed-user-bob" }),
  });
  const dmBody = await dmRes.json();
  console.log(`HTTP ${dmRes.status}`);
  console.log(JSON.stringify(dmBody, null, 2));
  assert.equal(dmRes.status, 200, "POST /conversations/dm should return 200");
  assert(Boolean(dmBody.id), "DM conversation should have an id");
  const conversationId = dmBody.id;

  // 7. Socket.IO connect + send-message
  console.log("\n[7] Testing Socket.IO connect + send-message...");
  const socket = io(BASE_URL, {
    auth: { token: aliceToken },
    transports: ["websocket"],
  });

  const clientMsgId = `cmsg-${Date.now()}`;
  const messageText = "Verification message via Socket.IO!";

  const socketMessage = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error("Socket send-message timed out after 25s"));
    }, 25000);

    socket.on("connect", () => {
      console.log(`Socket connected with ID: ${socket.id}`);
      socket.emit(
        "send-message",
        {
          conversationId,
          clientMsgId,
          kind: "text",
          body: messageText,
        },
        (ack) => {
          console.log("Socket send-message ack:", JSON.stringify(ack, null, 2));
          if (ack?.error) {
            clearTimeout(timer);
            socket.disconnect();
            reject(new Error(ack.error));
          } else {
            clearTimeout(timer);
            socket.disconnect();
            resolve(ack.message);
          }
        }
      );
    });

    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new Error(`Socket connection error: ${err.message}`));
    });
  });

  console.log("Socket message confirmed sent:", socketMessage);

  // 8. GET /conversations/:id/messages (locked response shape)
  console.log(`\n[8] Testing GET /conversations/${conversationId}/messages...`);
  const msgsRes = await fetch(`${BASE_URL}/conversations/${conversationId}/messages?limit=20`, {
    headers: {
      Authorization: `Bearer ${aliceToken}`,
    },
  });
  const msgsBody = await msgsRes.json();
  console.log(`HTTP ${msgsRes.status}`);
  console.log(JSON.stringify(msgsBody, null, 2));

  assert.equal(msgsRes.status, 200, `GET messages failed with HTTP ${msgsRes.status}`);
  assert(Array.isArray(msgsBody.messages), "Response missing 'messages' array");
  assert.equal(typeof msgsBody.hasMore, "boolean", "Response missing 'hasMore' boolean");
  assert(msgsBody.messages.length > 0, "No messages returned in messages array");

  // Locate the message we just sent via socket
  const restMessage = msgsBody.messages.find((m) => m.id === socketMessage.id);
  assert(Boolean(restMessage), `Rest messages should contain sent message id ${socketMessage.id}`);

  console.log("\n[9] Checking shape consistency between Socket emit and REST fetch...");
  console.log("Socket keys:", Object.keys(socketMessage).sort());
  console.log("REST keys:  ", Object.keys(restMessage).sort());

  // Mandated strict shape comparison
  assert.deepEqual(
    Object.keys(socketMessage).sort(),
    Object.keys(restMessage).sort(),
    "Socket and REST message shapes diverged"
  );

  if (socketMessage.sender && restMessage.sender) {
    console.log("Socket sender keys:", Object.keys(socketMessage.sender).sort());
    console.log("REST sender keys:  ", Object.keys(restMessage.sender).sort());
    assert.deepEqual(
      Object.keys(socketMessage.sender).sort(),
      Object.keys(restMessage.sender).sort(),
      "Socket and REST message sender shapes diverged"
    );
  }

  // 10. Verify ID sequence starts at 1
  const sortedById = [...msgsBody.messages].sort((a, b) => Number(a.id) - Number(b.id));
  const earliestMsg = sortedById[0];
  console.log(`\n[10] Verifying ID sequence starts at 1... Earliest message ID: "${earliestMsg.id}"`);
  assert.equal(earliestMsg.id, "1", `Earliest message ID should be '1' after sequence reset, got '${earliestMsg.id}'`);

  // 11. Verify flagged/moderated message in TetherChat Devs group
  console.log("\n[11] Verifying flagged/moderated message in 'TetherChat Devs' group...");
  const inboxRes = await fetch(`${BASE_URL}/me/conversations`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  const inbox = await inboxRes.json();
  const groupConv = inbox.find((c) => c.kind === "group" && c.name === "TetherChat Devs");
  assert(Boolean(groupConv), "Group conversation 'TetherChat Devs' should exist in Alice's inbox");

  const grpMsgsRes = await fetch(`${BASE_URL}/conversations/${groupConv.id}/messages`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  const grpMsgsBody = await grpMsgsRes.json();
  console.log(`TetherChat Devs messages (${grpMsgsBody.messages.length} total):`);
  console.log(JSON.stringify(grpMsgsBody.messages, null, 2));

  const flaggedMsg = grpMsgsBody.messages.find((m) => m.isModerated === true);
  assert(Boolean(flaggedMsg), "Expected to find a message with isModerated === true");
  assert.equal(flaggedMsg.isModerated, true, "flaggedMsg.isModerated must be true");
  assert.equal(flaggedMsg.moderationReason, "test-flag", "flaggedMsg.moderationReason must be 'test-flag'");
  assert.equal(
    flaggedMsg.body,
    "Message hidden due to content moderation",
    "Moderated message body must be placeholder text"
  );
  console.log("Verified flagged message rendered with isModerated: true and non-null reason:", {
    id: flaggedMsg.id,
    isModerated: flaggedMsg.isModerated,
    moderationReason: flaggedMsg.moderationReason,
    body: flaggedMsg.body,
  });

  console.log("\n==================================================================");
  console.log("PHASE 0a VERIFICATION: ALL CHECKS AND AUDITS PASSED PERFECTLY!");
  console.log("==================================================================");
}

run().catch((err) => {
  console.error("\nVerification failed:", err);
  process.exit(1);
});
