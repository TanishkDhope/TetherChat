# TetherChat — Firestore → PostgreSQL Migration Plan

**Status:** proposal · **Date:** 2026-09-19 · **Scope:** replace Cloud Firestore as the primary datastore with PostgreSQL. Firebase Auth is retained. Data access on the Node server uses Prisma.

---

## Table of contents

0. [Summary, goals, assumptions](#0-summary-goals-assumptions)
1. [Audit findings this plan is built on](#1-audit-findings-this-plan-is-built-on)
2. [Target architecture](#2-target-architecture)
3. [Schema design](#3-schema-design)
4. [Data migration strategy (ETL)](#4-data-migration-strategy-etl)
5. [Application-layer changes](#5-application-layer-changes)
6. [Cutover plan](#6-cutover-plan)
7. [Rollback / fallback strategy](#7-rollback--fallback-strategy)
8. [Flaws resolved by this migration](#8-flaws-resolved-by-this-migration)
9. [Risks, open questions, checklist](#9-risks-open-questions-checklist)

---

## 0. Summary, goals, assumptions

### What exists today

| Concern | Where it lives now |
|---|---|
| Users, friend graph, groups, 1:1 chat history | **Cloud Firestore, written directly from the browser** (`client/src/hooks/useFirestore.js`, `useAddUser.js`, `useGetUsername.js`) |
| Presence, rooms, message relay, WebRTC signalling | **In-process arrays** in `server/server.js` (`onlineUsers`, `rooms`, `offers`) — the server has no database access at all |
| Group chat history, per-room caches, room ids, profile edits | `localStorage` only |
| Authentication | Firebase Auth on the client; "logged in" = `localStorage["auth-info"].isAuth` (`client/src/hooks/useGetUserInfo.js`) |

### Goals

1. PostgreSQL is the **single durable store**. The browser never talks to a database; the Express server owns every read and write.
2. Identity is the Firebase `uid` everywhere (today it is a mix of `uid`, email, and mutable display name).
3. Messages are append-only rows — no whole-history rewrites, no size cap, server-assigned ids and timestamps.
4. Every mutation that spans two records (friend accept, group create, message + read cursor) is a single transaction.
5. Zero-loss cutover with a rehearsed, documented rollback.

### Non-goals

- Replacing Socket.IO (it stays as the realtime transport; it just stops being the source of truth).
- Replacing Firebase Auth (retained; the server verifies ID tokens).
- UI redesign. The client changes are limited to swapping the data hooks and removing the localStorage cache logic that causes data loss.

### Assumptions / decisions

| Decision | Choice | Why |
|---|---|---|
| ORM | **Prisma** | Schema-first, built-in migrations, works in plain-JS ESM (the repo is untyped). |
| Auth | **Keep Firebase Auth** | Smallest blast radius. `firebase-admin` verifies ID tokens on REST and on the Socket.IO handshake. |
| Hosting | Postgres next to the server (Render Postgres, or Neon) | The server already runs on Render (`client/src/lib/config.js` default URL). Plan is host-agnostic. |
| Cutover style | **Single maintenance window** (recommended); dual-write variant documented in §6.3 | User base is small; dual-write adds a second code path to a client that already has too many. |
| Read receipts | `conversation_members.last_read_message_id` cursor rather than a per-message receipts table | One integer per member per conversation instead of one row per message per member. |

---

## 1. Audit findings this plan is built on

Severity: **C**ritical / **H**igh / **M**edium / **L**ow. Ids are referenced from §8. Full problem → impact → fix detail is in the chat audit; this is the compressed form.

### A. Logic bugs

| # | Sev | Where | Problem |
|---|-----|-------|---------|
| A1 | C | `client/src/pages/Chat.jsx:244-276` | Loader prefers the `localStorage` cache and only reads Firestore when the cache is absent; a cached room is never refreshed → messages sent while the recipient was offline are never seen. |
| A2 | C | `client/src/hooks/useFirestore.js:18`, `Chat.jsx:297-334` | `setDoc(chats/<A_B>, {messages}, {merge:false})` on unmount overwrites the whole history with one client's local array → last-writer-wins data loss. |
| A3 | H | `server/server.js:159` | `disconnect` broadcasts `hangup` to everyone → any disconnect ends every video call. |
| A4 | H | `server/server.js:15-16, 170-199` | WebRTC signalling is global (`firstUser`, `offers[]`, broadcast `offer/answer/ice-candidate`); concurrent calls collide. |
| A5 | H | `client/src/pages/Home.jsx:410-427, 361-365`, `hooks/useGetRoomInfo.js:2` | 1:1 room ids are random `nanoid()`s kept only in each browser's `localStorage[displayName]`; peers diverge, `localStorage.clear()` on sign-out forgets them. |
| A6 | H | `Chat.jsx:313`, `Home.jsx:492` | Group messages are never persisted anywhere but `localStorage`. |
| A7 | H | `Home.jsx:523-579`, `Login.jsx:35-52`, `hooks/useAddUser.js:9-14` | Profile edits only touch `localStorage`; next login re-reads the stale Firestore doc and reverts them. |
| A8 | H | `useFirestore.js:6-8`, `Chat.jsx:256`, `server/server.js:36-42, 87, 129-134` | Display name (mutable, non-unique) is the identity for chat keys, socket lookups, `message.sender`, notification counters. |
| A9 | H | `Home.jsx:418, 363`, `useGetRoomInfo.js:2` | Raw display names used as `localStorage` keys — a user named `auth-info`/`groups`/`theme` corrupts other users' app state. |
| A10 | M | `Chat.jsx:461, 492, 384` | `message.id = Date.now()` and dedupe on it → same-millisecond messages dropped. |
| A11 | M | `Chat.jsx:466` vs `:497`, `:757` | Text messages carry ISO strings, stickers carry `Date` → Firestore `Timestamp` → `Invalid Date` after reload. |
| A12 | M | `Chat.jsx:191-206` | Typing indicator never resets after type-then-pause. |
| A13 | M | `Chat.jsx:226-242, 410, 469-477` | Read receipts are set by the sender based on socket count; `handleViewMessages` is dead. |
| A14 | M | `Chat.jsx:361-397`, `Home.jsx:346-399` | Socket listeners registered in effects with no `off` cleanup → duplicate handlers. |
| A15 | M | `Home.jsx:650-653`, `useFirestore.js:135-141`, `Home.jsx:231-243` | Group delete never reaches Firestore; groups resurrect on reload. |
| A16 | M | `useFirestore.js:146-186` | Friend ops are two sequential `updateDoc`s with no transaction and no validation. |
| A17 | L | `Home.jsx:263-279` | Dead `registeredUsers` bootstrap writes `[]` to `localStorage`. |
| A18 | L | `Home.jsx:1373-1396, 663-671` | "New Chat" modal is a no-op. |
| A19 | L | `Home.jsx:135-139` | Hard-coded fake `quickStats`. |
| A20 | L | `Login.jsx:32`, `Home.jsx:320`, `Chat.jsx:249` | Artificial `setTimeout` delays on the critical path. |
| A21 | L | `hooks/useGetUsername.js:7` | `where("email","==",…)` query where a `getDoc` by id would do. |
| A22 | L | `Chat.jsx:276, 348` | Effect deps omit `roomId`; previous room never left. |

### B. Data-modeling issues

| # | Sev | Where | Problem |
|---|-----|-------|---------|
| B1 | C | `useFirestore.js:11-46` | Entire chat history in one `messages[]` array field — 1 MiB doc cap, full rewrite per save, no pagination, no server timestamps inside arrays. |
| B2 | C | `useFirestore.js:6-8` | Conversation key = sorted display names. |
| B3 | H | `useAddUser.js:7`, `useFirestore.js:148-186` | Three competing identities (uid / email / displayName); no referential integrity. |
| B4 | H | `useFirestore.js:143-203` | Friend graph as mirrored arrays across two user docs, no transaction; requires cross-user write permission, so rules can't protect user docs. |
| B5 | H | `useFirestore.js:48-59`, `Home.jsx:321` | Whole `users` collection read on every Home load; exposes every user's email + friend graph. |
| B6 | M | `useFirestore.js:103-117` | `groups.members[]` has no membership metadata, no leave/kick, no message store. |
| B7 | M | `useFirestore.js:61-96` | `registered/users_list` unbounded-array-in-one-doc; dead code. |
| B8 | L | `useFirestore.js:106-108`, `useAddUser.js:10` | `id`/`email` duplicated in doc body. |
| B9 | L | repo root | No `firestore.rules` / indexes / `firebase.json` versioned. |
| B10 | L | `useFirestore.js:75, 86`, `Chat.jsx:466`, `useAddUser.js:13` | Mixed timestamp representations. |

### C. Architecture / security / performance

| # | Sev | Where | Problem |
|---|-----|-------|---------|
| C1 | C | `server/server.js:19-26, 35` | No socket authentication, CORS `*`; anyone can impersonate, join any room, delete any group, hang up everyone. |
| C2 | C | `hooks/useGetUserInfo.js`, `Home.jsx:299-303`, `Login.jsx:21-25` | Client-side "auth" is a `localStorage` boolean. |
| C3 | H | `server/server.js:56-72` | Friend/group events broadcast to every socket; clients filter by email → privacy leak. |
| C4 | H | `server/server.js:13-16, 76-123, 149-160` | All state in process memory; `rooms` never cleaned on disconnect; O(n²) presence traffic; lost on restart; single instance only. |
| C5 | M | `client/src/Firebase/firebase.js:22-23`, `Home.jsx:209-214` | `getMessaging()` at import can throw on unsupported browsers; FCM token only logged; SW on SDK 10.x vs app 11.x. |
| C6 | M | `SignUp.jsx:36-41`, `Home.jsx:536-541, 612-617` | Unsigned Cloudinary preset hardcoded. |
| C7 | M | `Chat.jsx:140-142, 227, 351-353`, `Home.jsx:492` | Chat history in `localStorage`, shared across users of a browser; sign-out wipes prefs too. |
| C8 | L | `client/package.json`, `server/package.json` | Unused deps (`@chakra-ui/react`, `@emotion/react`, `next-themes`, `react-feather`, `cloudinary`), Vite-2-era `@vitejs/plugin-react`, `nodemon` as prod dep. |
| C9 | L | `client/src/pages/video-call.jsx:286` | Placeholder TURN server. |
| C10 | L | repo | No tests, no CI, PII in `console.log`. |

---

## 2. Target architecture

```
┌──────────────────────────┐   HTTPS (REST)  + Socket.IO (WSS)   ┌──────────────────────────────┐        ┌──────────────┐
│  React / Vite PWA        │ ──────────────────────────────────▶ │  Express + Socket.IO server  │ ─────▶ │  PostgreSQL  │
│  (client/)               │   Authorization: Bearer <ID token>  │  (server/)                   │ Prisma │              │
│  Firebase Auth SDK only  │   socket.handshake.auth.token       │  firebase-admin verifies     │        │              │
└──────────────────────────┘                                     │  token → req.user.uid        │        └──────────────┘
            │                                                    │  owns ALL reads/writes       │
            ▼                                                    │  presence Map<uid, sockets>  │
   Firebase Auth (unchanged)  ◀── verifyIdToken() ───────────────┘  fan-out to conversation:<id>│
                                                                 └──────────────────────────────┘
```

Principles:

- **One identity.** `users.id` = Firebase `uid`. Email is a unique attribute, display name is a mutable attribute. Nothing is keyed on either.
- **Server-authoritative writes.** `send-message` inserts the row *then* fans out. The client's optimistic bubble is reconciled by `client_msg_id`.
- **Membership from the DB.** `socket.join("conversation:<id>")` is allowed only if `conversation_members` says so.
- **Targeted events.** Friend requests / group created / group deleted go to `io.to("user:<uid>")` (each socket joins `user:<uid>` on connect), never `broadcast`.
- **Signalling scoped.** `offer/answer/ice-candidate/hangup` are emitted to `conversation:<id>`, and `disconnect` only emits `hangup` to conversations where that socket had an active call.

### Request flows

| Flow | Steps |
|---|---|
| Login / sign-up | Firebase Auth on client → `POST /me/sync {displayName?, avatarUrl?}` with ID token → upsert `users` by `uid` (email from the token, not the body) → return profile. |
| Open Home | `GET /me` · `GET /me/friends` (accepted + pending in/out) · `GET /me/conversations` (with last message + unread count) · socket connect with token → joins `user:<uid>` + every member conversation. |
| Open chat | `GET /conversations/:id/messages?limit=50[&before=<id>]` (keyset) → render → `socket.emit("read", {conversationId, messageId})` bumps `last_read_message_id`. |
| Send message | `socket.emit("send-message", {conversationId, clientMsgId, kind, body})` → server checks membership → `INSERT … ON CONFLICT DO NOTHING` → `io.to("conversation:<id>").emit("message", row)`. |
| Friend request | `POST /friends/requests {toUserId}` → transaction: insert pending row → `io.to("user:<to>").emit("friend:request", …)`. |
| Accept | `POST /friends/requests/:otherUserId/accept` → transaction: flip status, get-or-create DM conversation → notify requester. |
| Create group | `POST /conversations {kind:"group", name, avatarUrl, memberIds}` → transaction: conversation + members (creator = owner) → `io.to("user:<m>")` for each member. |

---

## 3. Schema design

### 3.1 Collection → table mapping

| Firestore today | PostgreSQL | Notes |
|---|---|---|
| `users/<email>` `{email, displayName, profilePicUrl, timestamp, friends[], friendRequests[], sentRequests[]}` | `users` | PK becomes Firebase `uid`. Friend arrays leave the row entirely. |
| `users.friends[]`, `friendRequests[]`, `sentRequests[]` (mirrored on both docs) | `friendships` | One row per unordered pair with a `status`. `requested_by` replaces the sent/received split. |
| `groups/<nanoid>` `{id, name, members[], createdBy, groupPicUrl, createdAt}` | `conversations` (`kind='group'`) | DMs and groups unified; a DM is a 2-member conversation with a `dm_key`. |
| `groups.members[]` (emails) | `conversation_members` | Adds `role`, `joined_at`, `last_read_message_id`. |
| `chats/<nameA_nameB>.messages[]` `{id, text, sender, type, viewed, timestamp}` | `messages` | One row per message. Original `id` preserved as `client_msg_id`. |
| group messages (currently `localStorage` only) | `messages` | Not migratable (never stored server-side); starts empty. |
| `message.viewed` | `conversation_members.last_read_message_id` | Cursor, not per-message flags. |
| `registered/users_list` | — | Dead code; dropped. |
| — | `migration_log` | Provenance + quarantine for the ETL. Dropped after Phase 6. |

### 3.2 DDL (`server/prisma/migrations/0001_init/migration.sql`)

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email

CREATE TYPE friendship_status   AS ENUM ('pending', 'accepted', 'blocked');
CREATE TYPE conversation_kind   AS ENUM ('dm', 'group');
CREATE TYPE member_role         AS ENUM ('owner', 'member');
CREATE TYPE message_kind        AS ENUM ('text', 'sticker');

CREATE TABLE users (
  id            text PRIMARY KEY,                       -- Firebase uid
  email         citext NOT NULL UNIQUE,
  display_name  text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  avatar_url    text,
  bio           text,
  status_text   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE friendships (
  user_lo       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_hi       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        friendship_status NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  PRIMARY KEY (user_lo, user_hi),
  CHECK (user_lo < user_hi),
  CHECK (requested_by IN (user_lo, user_hi))
);
CREATE INDEX friendships_user_hi_idx ON friendships (user_hi);        -- PK already covers user_lo
CREATE INDEX friendships_pending_idx ON friendships (user_lo, user_hi) WHERE status = 'pending';

CREATE TABLE conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          conversation_kind NOT NULL,
  name          text,                                    -- NULL for DMs (derived from the other member)
  avatar_url    text,
  created_by    text REFERENCES users(id) ON DELETE SET NULL,
  dm_key        text,                                    -- '<lo>:<hi>' for DMs, NULL for groups
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),      -- bumped on every message; used for inbox ordering
  CHECK ((kind = 'dm') = (dm_key IS NOT NULL)),
  CHECK (kind = 'dm' OR name IS NOT NULL)
);
CREATE UNIQUE INDEX conversations_dm_key_uidx ON conversations (dm_key) WHERE kind = 'dm';
CREATE INDEX conversations_updated_idx ON conversations (updated_at DESC);

CREATE TABLE messages (
  id              bigserial PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       text REFERENCES users(id) ON DELETE SET NULL,
  kind            message_kind NOT NULL DEFAULT 'text',
  body            text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  client_msg_id   text,                                  -- client-generated idempotency key (old numeric id during ETL)
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, sender_id, client_msg_id)
);
CREATE INDEX messages_conv_id_idx ON messages (conversation_id, id DESC);   -- keyset pagination
CREATE INDEX messages_sender_idx  ON messages (sender_id);
-- optional, for a future search box:
-- CREATE INDEX messages_body_fts_idx ON messages USING gin (to_tsvector('simple', body));

CREATE TABLE conversation_members (
  conversation_id       uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id               text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                  member_role NOT NULL DEFAULT 'member',
  joined_at             timestamptz NOT NULL DEFAULT now(),
  last_read_message_id  bigint REFERENCES messages(id) ON DELETE SET NULL,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON conversation_members (user_id);

CREATE TABLE migration_log (
  id                bigserial PRIMARY KEY,
  source_collection text NOT NULL,
  source_doc_id     text NOT NULL,
  target_table      text,
  target_id         text,
  status            text NOT NULL,   -- ok | orphan_user | ambiguous_chat_key | unresolved_sender | inconsistent_friend_edge | skipped
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX migration_log_status_idx ON migration_log (status) WHERE status <> 'ok';

-- keep updated_at honest
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;
CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
```

Why these shapes:

- **`friendships (user_lo, user_hi)` with `CHECK (user_lo < user_hi)`** — exactly one row per pair regardless of who asked; "pending in / pending out" is derived from `requested_by`. Replaces three mirrored arrays that could disagree (B4, A16).
- **`conversations.dm_key`** — deterministic id for a DM (`least(uid1,uid2) || ':' || greatest(uid1,uid2)`); get-or-create is `INSERT … ON CONFLICT (dm_key) DO NOTHING RETURNING id`. Replaces random per-browser room ids (A5) and name-based chat keys (B2).
- **`messages.id bigserial`** — monotonic per table, so keyset pagination and "unread since" are integer comparisons. `client_msg_id` + unique constraint makes re-sends idempotent (A10).
- **No denormalised names in `messages`** — `sender_id` joins to `users`; renaming a user touches one row (A8).
- **`conversation_members.last_read_message_id`** — unread count is `COUNT(*) WHERE id > last_read_message_id`; no per-message receipt rows (A13).

### 3.3 Prisma schema (`server/prisma/schema.prisma`)

```prisma
generator client { provider = "prisma-client-js" }
datasource db     { provider = "postgresql"; url = env("DATABASE_URL") }

enum FriendshipStatus { pending accepted blocked }
enum ConversationKind { dm group }
enum MemberRole       { owner member }
enum MessageKind      { text sticker }

model User {
  id           String   @id                         // Firebase uid
  email        String   @unique @db.Citext
  displayName  String   @map("display_name")
  avatarUrl    String?  @map("avatar_url")
  bio          String?
  statusText   String?  @map("status_text")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz

  friendshipsLo  Friendship[] @relation("lo")
  friendshipsHi  Friendship[] @relation("hi")
  memberships    ConversationMember[]
  messages       Message[]
  createdConvs   Conversation[]
  @@map("users")
}

model Friendship {
  userLo       String           @map("user_lo")
  userHi       String           @map("user_hi")
  requestedBy  String           @map("requested_by")
  status       FriendshipStatus @default(pending)
  createdAt    DateTime         @default(now()) @map("created_at") @db.Timestamptz
  respondedAt  DateTime?        @map("responded_at") @db.Timestamptz
  lo User @relation("lo", fields: [userLo], references: [id], onDelete: Cascade)
  hi User @relation("hi", fields: [userHi], references: [id], onDelete: Cascade)
  @@id([userLo, userHi])
  @@index([userHi])
  @@map("friendships")
}

model Conversation {
  id         String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  kind       ConversationKind
  name       String?
  avatarUrl  String?          @map("avatar_url")
  createdBy  String?          @map("created_by")
  dmKey      String?          @unique @map("dm_key")
  createdAt  DateTime         @default(now()) @map("created_at") @db.Timestamptz
  updatedAt  DateTime         @default(now()) @map("updated_at") @db.Timestamptz
  creator    User?            @relation(fields: [createdBy], references: [id], onDelete: SetNull)
  members    ConversationMember[]
  messages   Message[]
  @@index([updatedAt(sort: Desc)])
  @@map("conversations")
}

model ConversationMember {
  conversationId     String     @map("conversation_id") @db.Uuid
  userId             String     @map("user_id")
  role               MemberRole @default(member)
  joinedAt           DateTime   @default(now()) @map("joined_at") @db.Timestamptz
  lastReadMessageId  BigInt?    @map("last_read_message_id")
  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  lastRead     Message?     @relation(fields: [lastReadMessageId], references: [id], onDelete: SetNull)
  @@id([conversationId, userId])
  @@index([userId])
  @@map("conversation_members")
}

model Message {
  id              BigInt      @id @default(autoincrement())
  conversationId  String      @map("conversation_id") @db.Uuid
  senderId        String?     @map("sender_id")
  kind            MessageKind @default(text)
  body            String
  clientMsgId     String?     @map("client_msg_id")
  createdAt       DateTime    @default(now()) @map("created_at") @db.Timestamptz
  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       User?        @relation(fields: [senderId], references: [id], onDelete: SetNull)
  readCursors  ConversationMember[]
  @@unique([conversationId, senderId, clientMsgId])
  @@index([conversationId, id(sort: Desc)])
  @@index([senderId])
  @@map("messages")
}
```

The `CHECK` constraints, partial indexes, extensions and trigger are not expressible in Prisma's schema language — keep them in the hand-written `0001_init/migration.sql` (Prisma runs whatever SQL is in the migration folder; generate the baseline with `prisma migrate diff`, then append the constraints). Serialise `BigInt` ids as strings at the API boundary (`JSON.stringify` cannot handle `BigInt`).

---

## 4. Data migration strategy (ETL)

All scripts live in `server/scripts/migrate/` and run with `node` (ESM). They are idempotent — every run upserts and records provenance in `migration_log`, so a failed run can be re-executed.

### 4.0 Freeze & snapshot

1. Deploy the client with `VITE_MAINTENANCE=1` (a full-screen "back in N minutes" gate in `App.jsx`) so nothing writes to Firestore during the window.
2. Take an immutable backup: `gcloud firestore export gs://<bucket>/tetherchat-<date>` — this is also the rollback artefact (§7).
3. Record the freeze timestamp `T_freeze`; anything in Firestore newer than it after the window means the gate leaked.

### 4.1 Extract — `extract.js`

`firebase-admin` (service account from `FIREBASE_SERVICE_ACCOUNT`) streams each collection to NDJSON under `server/scripts/migrate/out/`:

| Source | Output | Notes |
|---|---|---|
| `users/*` | `users.ndjson` | one line per doc: `{docId, email, displayName, profilePicUrl, timestamp, friends, friendRequests, sentRequests}` |
| `groups/*` | `groups.ndjson` | `{docId, name, members, createdBy, groupPicUrl, createdAt}` |
| `chats/*` | `chats.ndjson` | `{docId, messages:[…]}` — Firestore `Timestamp`s converted to ISO strings on the way out |
| Firebase Auth users | `auth-users.ndjson` | `admin.auth().listUsers()` paged: `{uid, email, displayName, photoURL, creationTime}` |
| `registered/*` | — | ignored (dead, B7) |

### 4.2 Transform — `transform.js`

Produces load-ready NDJSON per target table plus `migration_log.ndjson`. Resolution rules, in order:

**Users**
1. Build `emailToUid` from `auth-users.ndjson` (lower-cased email).
2. For each `users` doc: `uid = emailToUid[lower(docId)]`. Missing → log `orphan_user` (the Firestore doc has no Auth account; it cannot log in anyway) and skip.
3. `display_name = displayName ?? auth.displayName ?? email.split("@")[0]`; `avatar_url = profilePicUrl ?? auth.photoURL`; `created_at = timestamp ?? auth.creationTime`.
4. Build `nameToUids: Map<displayName, uid[]>` — needed for chats.

**Friendships**
1. For each user A and each `friends[]` entry email B → candidate accepted edge `(lo, hi)`; dedupe into a `Map<"lo:hi", row>`. An edge present on only one side is still accepted (the sequential `arrayUnion` pair at `useFirestore.js:162-169` could half-fail) but logged `inconsistent_friend_edge`.
2. For each user B and each `friendRequests[]` entry A → pending edge `requested_by = A`. Cross-check A's `sentRequests[]`; mismatch → log, keep the recipient's view (`friendRequests` is what the UI shows).
3. A pending edge that also exists as accepted → accepted wins.
4. Any email that does not resolve to a uid → log `skipped` with the edge.

**Groups → conversations + members**
1. `conversations` row: `id = uuidv5(NAMESPACE, docId)` (deterministic so re-runs collide predictably), `kind='group'`, `name`, `avatar_url = groupPicUrl || NULL`, `created_by = emailToUid[createdBy]`, `created_at = createdAt`.
2. `conversation_members`: one row per resolvable member email; creator gets `role='owner'`. Unresolvable emails are logged and dropped. A group with zero resolvable members is skipped entirely.

**Chats → DM conversations + messages** (the hard part — keys are `nameA_nameB` with sorted display names, and names may themselves contain `_`)
1. For `docId`, enumerate every split point `i` where `docId[i] === "_"`; candidates are `(docId[0:i], docId[i+1:])`.
2. Keep candidates where **both** halves exist in `nameToUids` and each maps to exactly one uid. Exactly one candidate → resolved. Zero or >1 → log `ambiguous_chat_key` with the candidate list; the doc is written to `out/unresolved-chats.ndjson`. A hand-maintained `overrides.csv` (`docId,uidA,uidB`) is consulted first on re-runs so manual resolution is repeatable.
3. Resolved pair → `conversations` row with `kind='dm'`, `dm_key = least:greatest`, `id = uuidv5(NAMESPACE, dm_key)`; two `conversation_members` rows.
4. Each element of `messages[]` → `messages` row:
   - `sender_id`: `message.sender` looked up in the pair first (`sender === nameA → uidA`), else in `nameToUids` if unique, else `NULL` + log `unresolved_sender`.
   - `kind = type === "sticker" ? "sticker" : "text"`, `body = text`.
   - `created_at`: parse `timestamp` (ISO string, or already-converted Firestore `Timestamp`); unparsable → fall back to `new Date(message.id)` (it was `Date.now()`), else the doc's position order with `T_freeze - (n - i) seconds` and a log note.
   - `client_msg_id = String(message.id)`; if two elements share an id inside one doc, suffix `-<index>` (A10 made collisions possible).
   - Stable order inside a conversation is the **array order**, not timestamp order (that is what users saw). Emit in that order so `bigserial` ids reflect it.
   - `viewed` is dropped; after load, set `last_read_message_id` for both members to the conversation's max message id (everything historical counts as read).

**Timestamps** — everything becomes UTC `timestamptz`. The client's `new Date()` values were local-clock; accept that drift.

### 4.3 Load — `load.js`

- Order: `users` → `friendships` → `conversations` → `conversation_members` → `messages` → read cursors → `migration_log`.
- Each table loads inside one transaction using `prisma.$transaction` with `createMany({ data, skipDuplicates: true })` in batches of 1 000 (or `COPY FROM STDIN` via `pg-copy-streams` if the message volume warrants it — measure in rehearsal).
- `messages.id` is left to `bigserial`, so the load must be sequential per conversation to preserve array order (sort the NDJSON by `(conversation_id, array_index)` before loading; parallelise across conversations only if ordering is by `created_at`).
- A load run writes `out/load-report.json` (rows attempted / inserted / skipped per table).

### 4.4 Verify — `verify.js`

Hard gates (any failure blocks cutover):

```sql
-- 1. Counts: every Firestore user with an Auth account has a row
SELECT count(*) FROM users;                            -- == users.ndjson lines − orphan_user count
SELECT count(*) FROM conversations WHERE kind='group';  -- == groups.ndjson lines − skipped
SELECT count(*) FROM conversations WHERE kind='dm';     -- == resolved chats
SELECT count(*) FROM messages;                          -- == Σ messages[] over resolved chats

-- 2. Per-conversation content hash, compared with the same hash computed over transformed NDJSON
SELECT conversation_id, count(*) AS n,
       md5(string_agg(body, E'\n' ORDER BY id)) AS body_hash
FROM messages GROUP BY conversation_id;

-- 3. Referential sanity
SELECT count(*) FROM conversation_members cm LEFT JOIN users u ON u.id = cm.user_id WHERE u.id IS NULL;   -- 0
SELECT count(*) FROM conversations c WHERE kind='dm'
  AND (SELECT count(*) FROM conversation_members WHERE conversation_id=c.id) <> 2;                        -- 0
SELECT count(*) FROM friendships WHERE user_lo >= user_hi;                                                -- 0 (CHECK guarantees)

-- 4. Nothing left unreviewed
SELECT status, count(*) FROM migration_log WHERE status <> 'ok' GROUP BY status;
```

Soft checks: 10 random DM conversations opened through the new `GET /conversations/:id/messages` and eyeballed against the Firestore console; every group visible to its members via `GET /me/conversations`; friend lists for 5 users match the Firestore arrays.

### 4.5 Rehearsal

Run 4.1 → 4.4 against a **staging** Postgres from the GCS export at least twice before the real window. Record wall-clock time; the maintenance window is 2× the rehearsed time + 30 minutes. Review every `migration_log` row that is not `ok` and populate `overrides.csv` before the real run.

---

## 5. Application-layer changes

### 5.1 Server (`server/`)

New layout:

```
server/
  prisma/schema.prisma, prisma/migrations/0001_init/migration.sql
  src/db.js            # PrismaClient singleton, BigInt → string JSON replacer
  src/auth.js          # verifyFirebaseToken (Express middleware) + socketAuth (io.use)
  src/routes/me.js     # GET /me, POST /me/sync, PATCH /me
  src/routes/users.js  # GET /users/search?q=
  src/routes/friends.js
  src/routes/conversations.js  # incl. /:id/messages
  src/realtime.js      # Socket.IO handlers (presence, rooms, messages, typing, signalling)
  src/services/*.js    # transactions (below)
  scripts/migrate/{extract,transform,load,verify,reverse-etl}.js
  server.js            # bootstrap only
```

`server.js` today → after:

| Today (`server/server.js`) | After |
|---|---|
| `onlineUsers[]`, `rooms[]`, `firstUser`, `offers[]` module arrays (`:13-16`) | `presence = new Map<uid, Set<socketId>>()`; rooms are Socket.IO rooms named `conversation:<uuid>`; no offer replay. |
| `socket.on("join", {displayName, email, …})` trusts the payload (`:35-49`) | `io.use(socketAuth)` verifies `handshake.auth.token`; `socket.data.uid` set once; `join` event removed. |
| `io.emit("onlineUsers", fullList)` on every change (`:43, 48, 152`) | `presence:online {uid}` / `presence:offline {uid}` diff events to the user's **friends only**; `GET /me/friends` returns `online` flags from the Map. |
| `joinRoom` by display name (`:76-105`) | `join-conversation {id}` → membership check → `socket.join`. |
| `send-message` relays unpersisted (`:145-147`) | insert via `messageService.send()` → emit stored row (with `id`, `createdAt`, `senderId`) to the room. |
| `friendRequest`/`friendAccepted`/`createGroup`/`deleteGroup` broadcast (`:56-72`) | emitted by the REST handlers to `user:<uid>` rooms only. |
| `disconnect` → `broadcast.emit("hangup")` (`:159`) | `hangup` only to conversations in `socket.data.activeCalls`. |
| `offer/answer/ice-candidate` broadcast (`:181-192`) | `socket.to("conversation:<id>").emit(...)`, payload includes `conversationId`. |
| `cors({ origin: "*" })` (`:20-26`) | `origin: process.env.CORS_ORIGIN.split(",")`. |

Environment: `DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT` (base64 JSON), `CORS_ORIGIN`, `PORT`. Dependencies added: `@prisma/client`, `prisma` (dev), `firebase-admin`, `zod` (payload validation). `nodemon` moves to devDependencies; `start` becomes `node server.js`.

**Transactions (`src/services/`)**

| Operation | Statements inside one `prisma.$transaction` |
|---|---|
| `friends.accept(me, other)` | `UPDATE friendships SET status='accepted', responded_at=now() WHERE (user_lo,user_hi)=(…) AND status='pending' AND requested_by=other` (must affect 1 row) → `INSERT INTO conversations (kind,dm_key) VALUES ('dm', lo||':'||hi) ON CONFLICT (dm_key) DO NOTHING` → `INSERT INTO conversation_members … ON CONFLICT DO NOTHING` ×2. |
| `friends.request(me, other)` | validate `me <> other` and both exist → `INSERT INTO friendships … ON CONFLICT (user_lo,user_hi) DO NOTHING` (0 rows → 409 already-pending/friends). |
| `conversations.createGroup(me, dto)` | `INSERT conversations` → `INSERT conversation_members` for `{me: owner} ∪ members` — members must be accepted friends of `me` (`WHERE EXISTS friendships accepted`) or the transaction aborts. |
| `conversations.deleteGroup(me, id)` | `DELETE FROM conversations WHERE id=$1 AND kind='group' AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2 AND role='owner')` — cascade removes members + messages. |
| `messages.send(me, dto)` | membership check → `INSERT INTO messages … ON CONFLICT (conversation_id, sender_id, client_msg_id) DO NOTHING RETURNING *` → `UPDATE conversations SET updated_at = now()` → `UPDATE conversation_members SET last_read_message_id = <new id> WHERE user_id = me`. |
| `messages.markRead(me, conv, msgId)` | `UPDATE conversation_members SET last_read_message_id = GREATEST(COALESCE(last_read_message_id,0), $msgId) WHERE …` — monotonic. |

**Query catalogue**

```sql
-- Inbox: my conversations, newest activity first, with last message + unread count
SELECT c.id, c.kind, c.name, c.avatar_url, c.updated_at,
       lm.id AS last_message_id, lm.body AS last_body, lm.kind AS last_kind, lm.created_at AS last_at,
       (SELECT count(*) FROM messages m
         WHERE m.conversation_id = c.id AND m.id > COALESCE(cm.last_read_message_id, 0)
           AND m.sender_id IS DISTINCT FROM cm.user_id) AS unread
FROM conversation_members cm
JOIN conversations c ON c.id = cm.conversation_id
LEFT JOIN LATERAL (
  SELECT * FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1
) lm ON true
WHERE cm.user_id = $1
ORDER BY c.updated_at DESC;

-- Keyset page of messages (before = last id the client has; NULL for first page)
SELECT m.*, u.display_name, u.avatar_url
FROM messages m LEFT JOIN users u ON u.id = m.sender_id
WHERE m.conversation_id = $1 AND ($2::bigint IS NULL OR m.id < $2)
ORDER BY m.id DESC LIMIT 50;

-- Friends + pending, one query
SELECT f.*, CASE WHEN f.user_lo = $1 THEN f.user_hi ELSE f.user_lo END AS other_id,
       CASE WHEN f.status='accepted' THEN 'friend'
            WHEN f.requested_by = $1 THEN 'sent' ELSE 'received' END AS relation
FROM friendships f WHERE $1 IN (f.user_lo, f.user_hi) AND f.status <> 'blocked';

-- DM get-or-create
INSERT INTO conversations (kind, dm_key) VALUES ('dm', least($1,$2) || ':' || greatest($1,$2))
ON CONFLICT (dm_key) DO UPDATE SET dm_key = EXCLUDED.dm_key   -- no-op update so RETURNING works
RETURNING id;

-- User search (replaces getRegisteredUsers) — never returns friend graphs
SELECT id, display_name, avatar_url FROM users
WHERE display_name ILIKE '%' || $1 || '%' OR email = lower($1)
ORDER BY display_name LIMIT 20;
```

Prisma equivalents: `prisma.message.findMany({ where: { conversationId, id: { lt: before } }, orderBy: { id: "desc" }, take: 50, include: { sender: { select: { displayName: true, avatarUrl: true } } } })`; the inbox and get-or-create queries use `prisma.$queryRaw` (LATERAL and `ON CONFLICT … RETURNING` are not expressible in the query API).

**Indexes** (already in the DDL): `messages(conversation_id, id DESC)`, `messages(sender_id)`, `conversation_members(user_id)`, `friendships(user_hi)`, `friendships` partial on pending, `conversations(dm_key)` partial unique, `conversations(updated_at DESC)`, `users(email)` unique (citext). Run `EXPLAIN (ANALYZE, BUFFERS)` on the inbox query during rehearsal with production-sized data.

**Connection pooling**: Render Postgres / Neon free tiers cap connections; set `connection_limit=5` in `DATABASE_URL` for a single server instance, or front with PgBouncer (transaction mode) / Neon's pooled endpoint and set `pgbouncer=true` in the Prisma URL.

### 5.2 Client (`client/`)

| File | Change |
|---|---|
| `src/lib/config.js` | add `API_URL` (`VITE_API_URL`, defaults to `SOCKET_URL`). |
| `src/lib/api.js` (new) | `apiFetch(path, opts)` → attaches `Authorization: Bearer ${await auth.currentUser.getIdToken()}`, JSON in/out, throws on non-2xx. |
| `src/hooks/useFirestore.js` → `src/hooks/useApi.js` | Same exported names so call sites barely change: `getMessages(conversationId, before)`, `createGroup`, `getUserGroups` → `getConversations`, `deleteGroup`, `sendFriendRequest`, `acceptFriendRequest`, `declineFriendRequest`, `getFriendData`, `getUsersByEmails` → `searchUsers`. `storeMessages`, `getRegisteredUsers`, `addRegisteredUser` are deleted. |
| `src/hooks/useAddUser.js` | `addUser()` → `POST /me/sync`. Called once after Firebase sign-in; the server takes email from the token, never from the body. |
| `src/hooks/useGetUsername.js` | `getUsername()` → `GET /me`. |
| `src/hooks/useGetUserInfo.js` | Reads Firebase `auth.currentUser` (via `onAuthStateChanged` in a provider) instead of `localStorage["auth-info"]`; exposes `uid`. |
| `src/hooks/useGetRoomInfo.js` | Deleted — conversation ids come from the server. |
| `src/pages/Login.jsx`, `SignUp.jsx` | After Firebase sign-in: `await addUser(...)` then navigate; drop the `auth-info` blob and the artificial delays. |
| `src/pages/Home.jsx` | Load `/me`, `/me/friends`, `/me/conversations`; `handleJoinRoom(user)` → `POST /conversations/dm {otherUserId}` → navigate to `/chat/<uuid>`; `handleJoinGroup(group)` → `/chat/<group.id>`; remove `localStorage` groups/rooms/registeredUsers/notifications keyed by name; friend/group socket handlers no longer filter by `toEmail` (server targets them); listeners get `off` cleanup. |
| `src/pages/Chat.jsx` | `roomId` is the conversation uuid. On mount: `GET /conversations/:id` (header data) + first page of messages; scroll-up loads `?before=`. `handleSubmit`/`sendSticker` emit `{conversationId, clientMsgId: crypto.randomUUID(), kind, body}` and render optimistically; on the server's `message` event replace the optimistic bubble by `clientMsgId`. Delete: `localStorage` `messages_*`/`msgLen_*`/`room_*`, the unmount `storeMessages`, `handleViewMessages`, the `get-user-notif`/`message-notif` flow (server pushes to `user:<uid>` instead). Emit `read` when the bottom is visible. |
| `src/pages/video-call.jsx` | Signalling payloads include `conversationId`; socket connects with the token. |
| `src/Firebase/firebase.js` | Keep `app`, `auth`, `googleProvider`. Remove `getFirestore`. Wrap `getMessaging`/`getAnalytics` in `isSupported()` guards (C5) or drop them. |
| `src/components/Sidebar.jsx` | Consumes `friends` with `relation` + `online` flags from the API; groups from `/me/conversations`; notification badges keyed by conversation id. |
| `package.json` | Remove `firebase/firestore` usage (the `firebase` package stays for Auth). |

### 5.3 Realtime contract after migration

| Event (client → server) | Payload | Server action |
|---|---|---|
| `join-conversation` | `{conversationId}` | membership check → `socket.join` |
| `send-message` | `{conversationId, clientMsgId, kind, body}` | `messages.send` → `message` to room |
| `typing` | `{conversationId, isTyping}` | relay to room (no persistence) |
| `read` | `{conversationId, messageId}` | `messages.markRead` → `read` to room |
| `call:offer` / `call:answer` / `call:ice` / `call:hangup` | `{conversationId, …sdp/candidate}` | relay to room; track `activeCalls` |

| Event (server → client) | Sent to |
|---|---|
| `message`, `typing`, `read`, `call:*` | `conversation:<id>` |
| `friend:request`, `friend:accepted`, `conversation:created`, `conversation:deleted`, `presence:online/offline` | `user:<uid>` of each affected user |

---

## 6. Cutover plan

### 6.1 Phases (recommended — single window)

| Phase | What | Exit criteria |
|---|---|---|
| **0 · Build** | Server routes/services/realtime + Prisma migrations on a branch; client swapped to `useApi`; ETL scripts. Deploy both to a **staging** environment with a staging Postgres. | Smoke checklist (6.2) passes on staging with ETL'd data from a GCS export. Two ETL rehearsals timed. |
| **1 · Announce & freeze** | Tag current `main` as `pre-postgres`. Deploy client with `VITE_MAINTENANCE=1`. Confirm no Firestore writes after `T_freeze` (check `users.timestamp`, `groups.createdAt`, chat doc update times in the console). | Zero writes for 5 minutes. |
| **2 · Migrate** | `gcloud firestore export` → `extract` → `transform` (with `overrides.csv`) → `load` into **production** Postgres → `verify`. `pg_dump` after load. | All hard gates in 4.4 green; `migration_log` non-ok rows reviewed and accepted. |
| **3 · Deploy** | Server: `DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT`, `CORS_ORIGIN` set; `prisma migrate deploy` already ran in Phase 2; deploy the new server build. Client: deploy build with `VITE_MAINTENANCE=0`, `VITE_API_URL` set. | Health check `GET /healthz` returns DB round-trip OK. |
| **4 · Smoke** | Run 6.2 against production with two real accounts. | All pass. |
| **5 · Bake** | 7 days. Firestore stays intact and **read-only** (rules flipped to deny writes). Watch server error rate, `messages` growth, `migration_log` reports from users ("my chat with X is missing"). | No rollback trigger (§7.2) fired. |
| **6 · Decommission** | Delete Firestore data (export retained in GCS for 90 days), drop `migration_log`, remove the Firestore branch, remove `firebase/firestore` from client imports, remove unsigned Cloudinary preset (C6, opportunistic). | — |

### 6.2 Smoke checklist (staging and production)

1. Email sign-up → profile appears in `users`; Google sign-in for an existing email maps to the same row (uid match, no duplicate).
2. Edit profile (name + avatar) → reload → persists; the other user sees the new name in an old conversation.
3. A → B friend request: B gets the toast without C seeing anything; accept → both see each other as friends; DM conversation exists once (`dm_key` unique).
4. A sends 3 messages while B is offline → B logs in → all 3 present, in order, unread badge = 3 → B opens → badge clears → A sees read indicator.
5. Two tabs as A send in the same instant → both stored, none dropped.
6. Group with 3 members: created → all see it; message → all receive; owner deletes → gone for all, non-owner cannot delete (403).
7. Video call A↔B while C disconnects elsewhere → call survives.
8. Sign out → sign in → history intact (no localStorage dependence).
9. A migrated DM: opens, scrolls back to the first migrated message, timestamps plausible, stickers render (A11).

### 6.3 Optional dual-write variant (if a window is unacceptable)

1. Deploy the server with `DATA_BACKEND=dual`: every write goes to Postgres (authoritative) **and** is mirrored to Firestore in the old shape by a `firestoreMirror.js` adapter (users doc, friend arrays, group docs, and appending to `chats/<A_B>.messages` via `arrayUnion`).
2. Backfill Postgres from a Firestore export with the ETL (Phase 2) while dual-writing; the ETL's `skipDuplicates` + `client_msg_id` unique key make it safe to overlap.
3. Flip the client to the API (Phase 3). Firestore now lags Postgres only by the mirror's latency.
4. After the bake, set `DATA_BACKEND=postgres` and remove the mirror.

Cost: the mirror must reproduce the name-keyed chat doc (B2) to be useful for rollback, which means keeping the display-name → chat-key logic alive. Only worth it if downtime is genuinely not an option.

---

## 7. Rollback / fallback strategy

### 7.1 Artefacts to have before Phase 1

- Git tag `pre-postgres` on both `client/` and `server/` (same repo, one tag).
- Firestore export in GCS (Phase 2 step 1). Firestore itself is untouched during the window — it is the rollback database.
- `pg_dump -Fc` after load and again before each later phase.
- Deployed-but-inactive previous builds on Render/Vercel (both platforms keep previous deploys; note the deploy ids).

### 7.2 Rollback triggers

| Trigger | Action |
|---|---|
| Any hard gate in 4.4 fails and cannot be fixed inside the window | Abort before Phase 3: redeploy client with `VITE_MAINTENANCE=0` from tag `pre-postgres`. Nothing to undo — Firestore was never modified. |
| Smoke checklist (6.2) fails in production | Same as above, plus keep the loaded Postgres for diagnosis. |
| During bake: elevated 5xx on `/conversations/*`, users reporting missing conversations that `migration_log` doesn't explain, data corruption | Roll back with reverse-ETL (7.3). |

### 7.3 Rolling back after cutover (bake period)

1. Set `VITE_MAINTENANCE=1`; record `T_rollback`.
2. Run `scripts/migrate/reverse-etl.js`: for every `messages` row with `created_at > T_freeze`, append into Firestore `chats/<nameA_nameB>.messages` (rebuilding the name key from the two members' current display names — the same rule `useFirestore.js:6-8` uses), and re-create any `friendships`/`conversations(kind='group')` rows created after `T_freeze` in their old shapes. Group messages have no Firestore home and are lost on rollback — state this in the announcement.
3. Flip Firestore rules back to read-write.
4. Redeploy `pre-postgres` client and server.
5. `VITE_MAINTENANCE=0`. Post-mortem before retrying.

### 7.4 Feature-flag fallback inside the new server

`DATA_BACKEND=firestore|postgres` is honoured by the new server for **reads of legacy DM history only**: if a conversation has a `migration_log` row with status ≠ `ok`, `GET /conversations/:id/messages` can fall through to reading the old Firestore doc via `firebase-admin` until the override is resolved. This keeps "my old chat is missing" from being an outage while the mapping is fixed by hand. Removed in Phase 6.

---

## 8. Flaws resolved by this migration

Directly resolved by the schema and server-authoritative design (no separate fix needed):

| Id | How it is resolved |
|---|---|
| **A1** | Client always fetches from `GET /conversations/:id/messages`; the `localStorage` message cache is deleted. |
| **A2** | Messages are append-only rows inserted by the server; there is no "store the whole array" path. |
| **A5** | Conversation ids are server-owned uuids; DMs are deduplicated by `dm_key`. |
| **A6** | Group messages are `messages` rows like any other. |
| **A7** | `PATCH /me` is the single write path for profile edits; login syncs *to* the DB, not from a stale doc. |
| **A8** | Every key is a `uid`; display names are attributes joined at read time. |
| **A9** | No display-name-keyed `localStorage` writes remain. |
| **A10** | `messages.id` is `bigserial`; `client_msg_id` unique constraint makes retries idempotent. |
| **A11** | `created_at timestamptz DEFAULT now()`; one serialisation (ISO) at the API boundary. |
| **A13** | `last_read_message_id` cursor + `read` event give real read state. |
| **A15** | `DELETE /conversations/:id` is authorised (owner) and cascades; groups cannot resurrect. |
| **A16** | Friend operations are single transactions with `CHECK`/`UNIQUE` constraints and validation. |
| **B1–B10** | Replaced wholesale by the relational schema in §3 (normalised, FK-enforced, versioned migrations, `timestamptz` everywhere; `registered/users_list` dropped; no rules file needed because the browser has no DB access). |
| **C1** | Socket handshake and every REST call verify a Firebase ID token; room joins are authorised against `conversation_members`. |
| **C2** | Server identity comes from the verified token; `localStorage["auth-info"]` is removed. |
| **C3** | Friend/group events are targeted to `user:<uid>` rooms. |
| **C4** | Rooms/membership live in Postgres; presence is a `Map` keyed by uid with diff events; state survives restarts. (Multi-instance scaling still needs the Socket.IO Redis adapter — noted in §9.) |
| **C7** | Chat history no longer lives in `localStorage`; sign-out clears only auth. |

Partially resolved / made trivial: **A3, A4** — once every socket carries a `uid` and every call is scoped to a `conversationId`, `hangup` and signalling stop being global; the plan includes that change in `realtime.js` (§5.1) but it is not a database consequence.

Not addressed by the migration (still recommended, independent work): **A12** (typing debounce), **A14** (listener cleanup — the client rewrite should do this while touching those effects), **A17–A22** (dead code / artificial delays), **C5** (FCM guards), **C6** (Cloudinary signed uploads — natural to move behind the new server), **C8** (dependency cleanup), **C9** (real TURN server), **C10** (tests/CI — the new server is the right place to start: service-level tests against a disposable Postgres via `testcontainers` or a `docker-compose` DB).

---

## 9. Risks, open questions, checklist

### Risks

| Risk | Mitigation |
|---|---|
| Chat keys `nameA_nameB` that cannot be resolved unambiguously (duplicate display names, names containing `_`). | `ambiguous_chat_key` quarantine + `overrides.csv`; §7.4 read-through fallback keeps history reachable until resolved. Measure the count in rehearsal. |
| Firestore `users` docs with no Firebase Auth account (created by a pre-Auth code path). | Logged `orphan_user`; they cannot log in today, so nothing is lost. |
| Google-login users whose Firestore `displayName` differs from what they typed at email sign-up. | Transform prefers the Firestore doc value (what other users saw in chats). |
| Free-tier Postgres limits (Render: 1 GB / expires after 90 days on free; Neon: compute autosuspend). | Pick the tier before Phase 0; `messages` at 4 000 chars max grows slowly at this scale. Add a `pg_dump` cron. |
| Render cold starts make the first API call slow. | Unchanged from today's socket cold start; keep the `/healthz` ping. |
| Socket.IO across >1 server instance. | Out of scope now; `@socket.io/redis-adapter` + presence in Redis when needed — the design already keys everything by uid/conversation so nothing else changes. |
| `BigInt` message ids leaking into JSON. | `db.js` installs a `JSON.stringify` replacer / serialise as strings in the API layer; client treats ids as opaque strings. |

### Open questions

1. Retention: should Firestore's export be kept past 90 days for compliance/history?
2. Should blocked users (`friendship_status = 'blocked'`) be surfaced in v1, or is the enum just future-proofing?
3. Message search — worth adding the GIN index now (cheap) even if the UI search box stays unwired?

### Execution checklist

- [ ] Phase 0 branch: Prisma schema + `0001_init` SQL committed; `prisma migrate deploy` clean on an empty DB
- [ ] Server routes/services/realtime implemented; `zod` validation on every payload
- [ ] Client `useApi.js` + page changes; `firebase/firestore` import gone from the bundle
- [ ] ETL scripts + `overrides.csv` mechanism; two timed rehearsals on staging
- [ ] Smoke checklist 6.2 green on staging
- [ ] Tag `pre-postgres`; maintenance gate deployed; `T_freeze` recorded
- [ ] Export → ETL → verify (all hard gates) → `pg_dump`
- [ ] Deploy server + client; `/healthz` OK; smoke checklist green in production
- [ ] Firestore rules set to read-only; 7-day bake with error-rate watch
- [ ] Phase 6 decommission; `migration_log` dropped; Firestore export retained per retention answer
