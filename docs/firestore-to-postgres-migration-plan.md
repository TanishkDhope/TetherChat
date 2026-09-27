# TetherChat — Firestore → PostgreSQL Migration Plan

**Status:** Phase 0a & 0b Complete (Server Foundation & Client Migration Verified) · Phase 0c/Phase 1 Pending · **Date:** 2026-09-27 · **Scope:** replace Cloud Firestore as the primary datastore with PostgreSQL (Neon cloud database). Firebase Auth is retained. Data access on the Node server uses Prisma.

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
10. [Implementation status & remaining work roadmap](#10-implementation-status--remaining-work-roadmap)

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
| Auth | **Keep Firebase Auth** | Smallest blast radius. `firebase-admin` verifies ID tokens on REST and on Socket.IO handshake. Supports Firebase emulator in local development and service account JSON in production (Render). |
| Hosting | **Neon PostgreSQL** | Server connects via Neon pooled connection string (`DATABASE_URL` with `&pgbouncer=true`) and direct unpooled connection (`DIRECT_URL`) for migrations. |
| Phasing | **Phase 0 first** | Build schema, Prisma migrations, Express REST/Socket API, client data hooks (`useApi`), and seed script (`prisma/seed.js`) for end-to-end dev/test before executing ETL. |
| Cutover style | **Single maintenance window** (recommended); dual-write variant documented in §6.3 | User base is small; dual-write adds a second code path to a client that already has too many. |
| Read receipts | `conversation_members.last_read_message_id` cursor rather than a per-message receipts table | One integer per member per conversation instead of one row per message per member. |
| Moderation | `is_moderated` boolean + optional `moderation_reason` on `messages` table | Explicit schema support for the Jev AI content moderation system (`server/src/services/moderation.js`). |
| Search Index | **Deferred GIN index** | Keep initial migration lean; add full-text GIN index in a future migration when search UI is introduced. |

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
  id                bigserial PRIMARY KEY,
  conversation_id   uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id         text REFERENCES users(id) ON DELETE SET NULL,
  kind              message_kind NOT NULL DEFAULT 'text',
  body              text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  is_moderated      boolean NOT NULL DEFAULT false,
  moderation_reason text,
  client_msg_id     text,                                  -- client-generated idempotency key (old numeric id during ETL)
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, sender_id, client_msg_id)
);
CREATE INDEX messages_conv_id_idx ON messages (conversation_id, id DESC);   -- keyset pagination
CREATE INDEX messages_sender_idx  ON messages (sender_id);
-- full-text search index (deferred until search UI is built):
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
datasource db     { provider = "postgresql"; url = env("DATABASE_URL"); directUrl = env("DIRECT_URL") }

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
  id                BigInt      @id @default(autoincrement())
  conversationId    String      @map("conversation_id") @db.Uuid
  senderId          String?     @map("sender_id")
  kind              MessageKind @default(text)
  body              String
  isModerated       Boolean     @default(false) @map("is_moderated")
  moderationReason  String?     @map("moderation_reason")
  clientMsgId       String?     @map("client_msg_id")
  createdAt         DateTime    @default(now()) @map("created_at") @db.Timestamptz
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
  prisma/schema.prisma, prisma/migrations/0001_init/migration.sql, prisma/seed.js
  src/db.js            # PrismaClient singleton, BigInt → string JSON replacer
  src/firebase.js      # dual-mode Firebase Admin SDK init (emulator vs service account)
  src/auth.js          # verifyFirebaseToken (Express middleware) + socketAuth (io.use) [emulator & service-account aware]
  src/routes/me.js     # GET /me, POST /me/sync, PATCH /me
  src/routes/users.js  # GET /users/search?q=
  src/routes/friends.js
  src/routes/conversations.js  # incl. /:id/messages
  src/routes/health.js         # GET /healthz (Render health check)
  src/routes/suggestReplies.js # protected with verifyFirebaseToken
  src/realtime.js      # Socket.IO handlers (presence, rooms, messages, typing, signalling)
  src/services/*.js    # transactions (below) & moderation.js
  scripts/seed-auth.js # emulator-only auth seeding with deterministic UIDs
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
| `send-message` relays unpersisted (`:145-147`) | pre-flight toxicity check via `moderation.js` (outside transaction) → insert via `messageService.send()` → emit stored row to the room. |
| `friendRequest`/`friendAccepted`/`createGroup`/`deleteGroup` broadcast (`:56-72`) | emitted by the REST handlers to `user:<uid>` rooms only. |
| `disconnect` → `broadcast.emit("hangup")` (`:159`) | `hangup` only to conversations in `socket.data.activeCalls`. |
| `offer/answer/ice-candidate` broadcast (`:181-192`) | `socket.to("conversation:<id>").emit(...)`, payload includes `conversationId`. |
| `cors({ origin: "*" })` (`:20-26`) | `origin: process.env.CORS_ORIGIN.split(",")`. |

**Environment variables:**

- `DATABASE_URL` — Neon pooled connection string (must include `&pgbouncer=true`).
- `DIRECT_URL` — Neon direct connection string, no pooler (used for `prisma migrate` only).
- `FIREBASE_PROJECT_ID` — Required in BOTH emulator and production modes. (The Firebase Admin SDK in emulator mode needs an explicit project ID because the emulator has no service account to derive it from.)
- `FIREBASE_SERVICE_ACCOUNT` — Base64 JSON of the service account key. Production only — NEVER set locally.
- `FIREBASE_AUTH_EMULATOR_HOST` — Host/port for Firebase Auth emulator (e.g. `localhost:9099`). Local/test only — NEVER set on Render.
- `CORS_ORIGIN` — Comma-separated list of allowed origins (e.g. `http://localhost:5173`).
- `PORT` — Server listening port (default `4000` locally, assigned by Render in production).

> [!WARNING]
> `pgbouncer=true` is REQUIRED for Neon pooled connections. It disables Prisma's prepared statements (PgBouncer in transaction mode cannot route them). Do NOT remove this flag to silence "prepared statement" warnings — everything will work locally and break under concurrent load on Render.

Dependencies added: `@prisma/client`, `firebase-admin`, `zod` (payload validation). DevDependencies: `prisma`. `nodemon` moves to devDependencies; `start` becomes `node server.js`.

**Health check (`GET /healthz`):**
- Mounted BEFORE the auth middleware. It must never require a token — Render's health check hits it before any user request arrives.
- Performs `await prisma.$queryRaw`SELECT 1`` to verify DB connectivity.
- Locked response shape (200 on success, 503 on DB error):
  ```json
  {
    "ok": true,
    "mode": "emulator",
    "db": "up",
    "uptime": 12.34,
    "timestamp": "2026-09-26T16:45:00.000Z"
  }
  ```

**Runtime:**
- `engines: { "node": ">=20.0.0" }` in `server/package.json`
- `.nvmrc` containing `"20"` in `server/`
- `NODE_VERSION=20` to Render environment variables

**Environment setup & Gitignore:**

Obtaining the base64 service account for Render:
```bash
base64 -i serviceAccountKey.json | tr -d '\n' > serviceAccountKey.b64
# Paste the contents of serviceAccountKey.b64 into Render's env var FIREBASE_SERVICE_ACCOUNT. Never commit either file.
```

`.gitignore` entries (required):
```gitignore
server/.env
server/.env.local
server/serviceAccountKey.json
server/serviceAccountKey.b64
output/screenshots/
server/scripts/migrate/out/
```

**Transactions (`src/services/`)**

| Operation | Implementation & Statements |
|---|---|
| `friends.accept(me, other)` | In one `prisma.$transaction`: `UPDATE friendships SET status='accepted', responded_at=now() WHERE (user_lo,user_hi)=(…) AND status='pending' AND requested_by=other` (must affect 1 row) → `INSERT INTO conversations (kind,dm_key) VALUES ('dm', lo||':'||hi) ON CONFLICT (dm_key) DO NOTHING` → `INSERT INTO conversation_members … ON CONFLICT DO NOTHING` ×2. |
| `friends.request(me, other)` | Validate `me <> other` and both exist → `INSERT INTO friendships … ON CONFLICT (user_lo,user_hi) DO NOTHING` (0 rows → 409 already-pending/friends). |
| `conversations.createGroup(me, dto)` | In one `prisma.$transaction`: `INSERT conversations` → `INSERT conversation_members` for `{me: owner} ∪ members` — members must be accepted friends of `me` (`WHERE EXISTS friendships accepted`) or the transaction aborts. |
| `conversations.deleteGroup(me, id)` | `DELETE FROM conversations WHERE id=$1 AND kind='group' AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2 AND role='owner')` — cascade removes members + messages. |
| `messages.send(me, dto)` | **1. Pre-flight (outside transaction):**<br>a. Membership check — `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`<br>b. Moderation call via `moderation.js` (existing 2s timeout, 3-tier fallback) → returns `{ isModerated, moderationReason }` synchronously.<br>**2. Single transaction (short-lived, no external I/O):**<br>a. `INSERT INTO messages (conversation_id, sender_id, client_msg_id, kind, body, is_moderated, moderation_reason) ON CONFLICT (conversation_id, sender_id, client_msg_id) DO NOTHING RETURNING *`<br>b. `UPDATE conversations SET updated_at = now() WHERE id = ...`<br>c. `UPDATE conversation_members SET last_read_message_id = <new id> WHERE conversation_id = ... AND user_id = me`<br>**3. After commit:** `io.to("conversation:<id>").emit("message", row)` |
| `messages.markRead(me, conv, msgId)` | `UPDATE conversation_members SET last_read_message_id = GREATEST(COALESCE(last_read_message_id,0), $msgId) WHERE …` — monotonic. |

> [!IMPORTANT]
> **Why moderation is hoisted outside the transaction:** Moderation makes an external HTTP call to Jev AI with an up to 2-second timeout. Holding a Postgres transaction open during external HTTP calls exhausts the Neon / PgBouncer connection pool and causes transaction timeouts under concurrent load on Render. Future implementers must never inline moderation into the database transaction!

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
-- blocked friendships are silently excluded from /me/friends in v1. There is no UI 
-- for blocking or unblocking; the enum value exists only for future-proofing. Note 
-- that requested_by is ambiguous for a blocked row (either party could have initiated 
-- the block) — resolve this when the UI is built.
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
| `src/hooks/useFirestore.js` → `src/hooks/useApi.js` | `useApi.js` replaces `useFirestore.js` with a new API surface. Call sites in `Home.jsx` and `Chat.jsx` MUST be rewritten regardless — the "same names" trick does not avoid the client rewrite, it only eases grep-replace for the trivial cases. Functions: `getMessages(conversationId, before)`, `createGroup`, `getConversations` (includes DMs and groups), `deleteGroup`, `sendFriendRequest`, `acceptFriendRequest`, `declineFriendRequest`, `getFriendData`, `searchUsers`. `storeMessages`, `getRegisteredUsers`, `addRegisteredUser` are deleted. |
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

| Phase | What | Exit criteria | Status |
|---|---|---|---|
| **0a · Server foundation** | Prisma schema + migrations on Neon, `db.js`, `firebase.js`, `auth.js`, all REST routes, `realtime.js`, seed scripts (`prisma/seed.js` + `scripts/seed-auth.js`), `GET /healthz`. NO client changes. | Smoke checklist passes **LOCALLY** with seeded data (via `scripts/seed-auth.js` + `prisma/seed.js`). Server is curl-testable end-to-end. | **COMPLETED** (D8 verification passed: all 11 HTTP checks + socket/REST shape consistency verified) |
| **0b · Client migration** | `api.js`, `useApi.js`, hook rewrites, `Home.jsx`, `Chat.jsx`, `video-call.jsx`, `Sidebar.jsx`, `firebase.js` cleanup. | Verified against local server + local client + Firebase Auth emulator. Zero Firestore/cache references. Clean build. | **COMPLETED** (Zero `firebase/firestore`, zero `localStorage` caches, 1 Socket.IO instance, Vite build passed) |
| **0c · Staging deployment** *(optional)* | Deploy 0a+0b to a staging Render web service connected to a Neon staging branch, with a Vercel preview deployment pointing at it. | Smoke checklist passes on staging with seeded data. | **PENDING** |
| **1 · Announce & freeze** | Tag current `main` as `pre-postgres`. Deploy client with `VITE_MAINTENANCE=1`. Confirm no Firestore writes after `T_freeze` (check `users.timestamp`, `groups.createdAt`, chat doc update times in the console). | Zero writes for 5 minutes. | **PENDING** |
| **2 · Migrate** | `gcloud firestore export` → `extract` → `transform` (with `overrides.csv`) → `load` into **production** Postgres → `verify`. `pg_dump` after load. | All hard gates in 4.4 green; `migration_log` non-ok rows reviewed and accepted. | **PENDING** |
| **3 · Deploy** | Server: `DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT`, `CORS_ORIGIN` set; `prisma migrate deploy` already ran in Phase 2; deploy the new server build. Client: deploy build with `VITE_MAINTENANCE=0`, `VITE_API_URL` set. | Health check `GET /healthz` returns DB round-trip OK (Render health check targets `/healthz`). | **PENDING** |
| **4 · Smoke** | Run 6.2 against production with two real accounts. | All pass. | **PENDING** |
| **5 · Bake** | 7 days. Firestore stays intact and **read-only** (rules flipped to deny writes). Watch server error rate, `messages` growth, `migration_log` reports from users ("my chat with X is missing"). | No rollback trigger (§7.2) fired. | **PENDING** |
| **6 · Decommission** | Delete Firestore data (export retained in GCS for 90 days), drop `migration_log`, remove the Firestore branch, remove `firebase/firestore` from client imports, remove unsigned Cloudinary preset (C6, opportunistic). | — | **PENDING** |

> [!NOTE]
> **Phasing Gate:** Phase 0a and Phase 0b are complete. Next step before production freeze (Phase 1) is either Phase 0c (Staging deployment) or Phase 2 migration rehearsals. Staging (Phase 0c) is defined as a secondary Render service + Neon branch + Vercel preview deployment.

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

### Resolved Decisions (Alignment from 2026-09-26 Review)

1. **Phasing & Roadmap**: Split into **Phase 0a (Server foundation)**, **Phase 0b (Client migration)**, and **Phase 0c (Staging deployment, optional)**. Phase 0a must be fully green locally before Phase 0b starts; Phase 0b must be fully green before Phase 1 (production freeze & ETL) begins.
2. **Database Provider & Connection**: **Neon PostgreSQL** (AWS `ap-southeast-1`). Configured with pooled connection `DATABASE_URL` (`&pgbouncer=true`) and direct unpooled connection `DIRECT_URL` for migrations.
3. **Authentication Strategy**: Firebase Auth retained. In local development and automated E2E testing, use Firebase Auth emulator (`FIREBASE_AUTH_EMULATOR_HOST` + `FIREBASE_PROJECT_ID`). In production deployed on Render, use Firebase Admin Service Account JSON key (`FIREBASE_SERVICE_ACCOUNT` + `FIREBASE_PROJECT_ID`).
4. **Content Moderation Integration**: Explicit columns `is_moderated boolean DEFAULT false` and `moderation_reason text` added to `messages` table schema and Prisma model. Moderation call is hoisted **outside** the database transaction in `messages.send` to protect connection pooling.
5. **Message Search Index**: Defer GIN full-text search index for now; add it in a future migration when a search UI is implemented.
6. **Seeding Strategy (Two Scripts)**:
   - `server/prisma/seed.js` — DB-only, idempotent upserts across users → friendships → conversations → conversation_members → messages. Enforces foreign key referential integrity.
   - `server/scripts/seed-auth.js` — Emulator-only. Asserts `FIREBASE_AUTH_EMULATOR_HOST` is set, creates Firebase Auth users with deterministic UIDs, then invokes `prisma/seed.js`.
7. **Health Monitoring**: `GET /healthz` performs `await prisma.$queryRaw`SELECT 1`` and returns `{ ok: true, mode: <"emulator"|"prod">, db: "up" }`. Render health check points to `/healthz`.
8. **Data Retention**: Firestore export retained in GCS for 90 days following cutover.
9. **Blocked Users**: `blocked` enum value kept in schema for future-proofing, no UI exposed in v1.

### Execution checklist

- [x] **Phase 0a · Server Foundation (COMPLETE — 2026-09-26)**:
  - [x] Add `@prisma/client`, `firebase-admin`, `zod` to dependencies; `prisma` to devDependencies; move `nodemon` to devDependencies
  - [x] Configure environment variables in `server/.env` and `server/.env.example` (`DATABASE_URL`, `DIRECT_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_AUTH_EMULATOR_HOST`, `CORS_ORIGIN`, `PORT`)
  - [x] Add required entries to `.gitignore` (`.env*`, `serviceAccountKey*`, `output/screenshots/`, `server/scripts/migrate/out/`)
  - [x] Initialize `server/prisma/schema.prisma` with `isModerated`, `moderationReason`, and `directUrl`
  - [x] Handcraft baseline migration `server/prisma/migrations/0001_init/migration.sql` with extensions, check constraints, and touch trigger
  - [x] Run `npx prisma migrate deploy` against Neon DB
  - [x] Verify `prisma migrate deploy` uses DIRECT_URL (not DATABASE_URL) — confirm no PgBouncer prepared-statement warnings during migration
  - [x] Implement `src/db.js` (Prisma singleton + BigInt JSON replacer attached via Express)
  - [x] Implement `src/firebase.js` (dual-mode init: emulator vs service account with production guard)
  - [x] Implement `src/auth.js` (verifyFirebaseToken Express middleware & socketAuth Socket.IO middleware)
  - [x] Implement REST endpoints:
    - [x] `src/routes/me.js` (GET /me, POST /me/sync, PATCH /me)
    - [x] `src/routes/users.js` (GET /users/search?q=)
    - [x] `src/routes/friends.js` (POST /friends/requests, POST /friends/requests/:id/accept, GET /me/friends)
    - [x] `src/routes/conversations.js` (GET /me/conversations, POST /conversations/dm, POST /conversations, DELETE /conversations/:id, GET /conversations/:id, GET /conversations/:id/messages with locked response shape)
    - [x] `src/routes/health.js` (Implement GET /healthz — performs `await prisma.$queryRaw\`SELECT 1\`` and returns `{ ok: true, mode: <"emulator"|"prod">, db: "up", uptime, timestamp }`. Returns 503 if DB fails. Mounted before auth.)
    - [x] `src/routes/suggestReplies.js` (mount verifyFirebaseToken)
  - [x] Implement `src/services/messages.js` (hoisting moderation call outside transaction per R5)
  - [x] Implement `src/services/friends.js` & `src/services/conversations.js`
  - [x] Implement `src/realtime.js` (presence Map, scoped rooms, server-persisted messages, scoped signalling)
  - [x] Create `server/prisma/seed.js` (DB-only, idempotent upserts with staggered timestamps & moderation test data)
  - [x] Create `server/scripts/seed-auth.js` (emulator-only with deterministic UIDs, supports `--reset`, invokes `prisma/seed.js`)
  - [x] Verify local curl flow end-to-end (`test-curl-flow.js` HTTP + Socket.IO suite passed all 11 gates and shape-consistency assertion)
- [x] **Phase 0b · Client Migration (COMPLETE — 2026-09-27)**:
  - [x] Configure `VITE_API_URL` & `VITE_SOCKET_URL` in `client/.env.local` and export `API_URL` & `SOCKET_URL` from `client/src/lib/config.js`
  - [x] Implement `client/src/lib/api.js` (`apiFetch` with ID token injection, 401 sign-out redirect, `ApiError`)
  - [x] Create `client/src/contexts/AuthContext.jsx` (`AuthProvider`, `useAuth`) and wrap `App.jsx`
  - [x] Implement `client/src/hooks/useApi.js` replacing `useFirestore.js`
  - [x] Implement `client/src/hooks/useSocket.js` (single Socket.IO proxy singleton, reconnect on token update, debounced disconnect)
  - [x] Rewrite `useAddUser.js` (`POST /me/sync`), `useGetUsername.js` (`GET /me`), and `useGetUserInfo.js` (derived from `auth.currentUser`)
  - [x] Delete `useFirestore.js` and `useGetRoomInfo.js`
  - [x] Rewrite `Login.jsx` & `SignUp.jsx` (remove `localStorage['auth-info']`, invoke `addUser`)
  - [x] Rewrite `Home.jsx` (server-backed `/me`, `/me/friends`, `/me/conversations`, realtime presence diffs, user search, group create)
  - [x] Rewrite `Chat.jsx` (keyset pagination `?before=`, optimistic messages with timeout, read receipts, debounced typing, moderation placeholder)
  - [x] Rewrite `video-call.jsx` (scoped signaling via `useSocket()`)
  - [x] Rewrite `client/src/Firebase/firebase.js` (auth only + emulator connection, remove Firestore, guard messaging/analytics)
  - [x] Audit & eliminate all `firebase/firestore` imports (0 occurrences in `client/src`)
  - [x] Audit & eliminate all `localStorage` message/room caching (0 occurrences in `client/src`)
  - [x] Audit socket connection instances (`io()` appears exactly once in `useSocket.js`)
  - [x] Verify production build (`npm run build` succeeds cleanly)
- [ ] **Phase 0c · Staging Deployment (Optional)**:
  - [ ] Deploy 0a to staging Render web service & 0b to Vercel preview deployment connected to Neon staging branch
  - [ ] Re-run smoke checklist with seeded data
- [ ] **Phase 1 · Announce & Freeze**:
  - [ ] Tag `pre-postgres`; deploy client maintenance gate (`VITE_MAINTENANCE=1`); record `T_freeze`
  - [ ] Confirm zero Firestore writes for 5 minutes
- [ ] **Phase 2 · Data Migration (ETL)**:
  - [ ] Implement `scripts/migrate/extract.js`, `transform.js`, `load.js`, `verify.js`
  - [ ] Implement `scripts/migrate/reverse-etl.js` (used during bake for rollback — see §7.3)
  - [ ] Establish `overrides.csv` workflow (`docId,uidA,uidB`) consulted before automatic resolution in `transform.js`
  - [ ] Two timed rehearsals against staging Postgres (measure wall-clock; window = 2× rehearsal + 30 min buffer)
  - [ ] Export Firestore → ETL (`extract.js`, `transform.js`, `load.js`) → verify hard gates → `pg_dump`
- [ ] **Phase 3 · Production Deployment & Cutover**:
  - [ ] Set production env vars on Render (`DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT`, `CORS_ORIGIN`, `PORT`)
  - [ ] Run `prisma migrate deploy` on production Neon DB
  - [ ] Deploy server to Render; confirm `GET /healthz` returns DB round-trip OK
  - [ ] Deploy client to Vercel with `VITE_MAINTENANCE=0`, `VITE_API_URL`
- [ ] **Phase 4 · Smoke Testing**:
  - [ ] Run Smoke Checklist 6.2 in production with two real accounts
- [ ] **Phase 5–6 · Bake & Decommission**:
  - [ ] 7-day bake; keep Firestore read-only
  - [ ] Decommission Firestore; drop `migration_log`; keep backup per 90-day retention

---

## 10. Implementation status & remaining work roadmap

### 10.1 Implemented items (Phase 0a & Phase 0b)

#### 1. Backend Foundation (Phase 0a) — COMPLETE
- **Database Schema & Migrations:**
  - Neon PostgreSQL provisioned in AWS `ap-southeast-1`.
  - Schema defined in `server/prisma/schema.prisma` with `directUrl` for migrations and `DATABASE_URL` with `&pgbouncer=true`.
  - Baseline migration `server/prisma/migrations/0001_init/migration.sql` deployed: tables `users`, `friendships`, `conversations`, `conversation_members`, `messages`, `migration_log`. Includes extensions `uuid-ossp`, `citext`, check constraint `user_lo < user_hi`, trigger `touch_updated_at`, partial unique index on `conversations(dm_key)`.
- **Database Access & Services:**
  - `server/src/db.js`: Prisma client singleton with BigInt JSON serialization.
  - `server/src/firebase.js`: Dual-mode Firebase Admin SDK init (`FIREBASE_AUTH_EMULATOR_HOST` vs base64 `FIREBASE_SERVICE_ACCOUNT`).
  - `server/src/auth.js`: `verifyFirebaseToken` Express middleware and `socketAuth` Socket.IO handshake middleware.
  - `server/src/services/messages.js`: External moderation hoisted outside DB transaction; monotonic read cursors (`GREATEST`).
  - `server/src/services/friends.js`: Atomic friendship requests and accepts with DM creation.
  - `server/src/services/conversations.js`: Group creation with friend validation, deletion with cascade, inbox query with unread count.
  - `server/src/realtime.js`: In-memory presence map with diff emissions (`presence:online`, `presence:offline`), scoped `conversation:<id>` rooms, server-persisted messages, scoped WebRTC signaling.
- **REST Endpoints:**
  - `GET /healthz`: Unauthenticated, mounted before auth, returns `{ ok, mode, db, uptime, timestamp }`.
  - `GET /me`, `POST /me/sync`, `PATCH /me`.
  - `GET /users/search?q=`.
  - `GET /me/friends`, `POST /friends/requests`, `POST /friends/requests/:id/accept`.
  - `GET /me/conversations`, `POST /conversations/dm`, `POST /conversations`, `DELETE /conversations/:id`, `GET /conversations/:id`, `GET /conversations/:id/messages`.
  - `POST /api/suggest-replies`: Mounted with token verification.
- **Seeding & Verification Suite:**
  - `server/prisma/seed.js`: Upserts deterministic users (`alice`, `bob`, `charlie`), friendships, DM with 4 messages & unread cursor, group with 2 messages (1 moderated).
  - `server/scripts/seed-auth.js`: Seeds Firebase Auth emulator accounts (`password123`) with `--reset` support.
  - `server/scripts/test-curl-flow.js`: End-to-end integration test exercising Express HTTP and Socket.IO layers; strict socket vs REST message shape consistency verified.

#### 2. Frontend Client Migration (Phase 0b) — COMPLETE
- **Configuration & Transport:**
  - `client/src/lib/config.js` & `client/.env.local`: Configured `API_URL` and `SOCKET_URL`.
  - `client/src/lib/api.js`: `apiFetch` with automatic Firebase ID token injection, 401 redirect to `/login`, and `ApiError` class.
- **Authentication & Global State:**
  - `client/src/contexts/AuthContext.jsx`: `AuthProvider` managing `currentUser`, `loading`, and token lifecycle.
  - `client/src/App.jsx`: Wrapped in `AuthProvider`.
  - `client/src/hooks/useGetUserInfo.js`: Derived directly from `auth.currentUser`.
  - `client/src/Pages/Login.jsx` & `client/src/Pages/SignUp.jsx`: Removed `localStorage['auth-info']` and artificial delays; calls `addUser` (`POST /me/sync`).
- **Data & Realtime Hooks:**
  - `client/src/hooks/useApi.js`: Exposes REST client methods (`getMessages`, `createGroup`, `getConversations`, `deleteGroup`, `sendFriendRequest`, `acceptFriendRequest`, `getFriendData`, `searchUsers`).
  - `client/src/hooks/useAddUser.js`: Calls `POST /me/sync`.
  - `client/src/hooks/useGetUsername.js`: Calls `GET /me`.
  - `client/src/hooks/useSocket.js`: Single proxy instance for Socket.IO connection across pages, auto-reconnecting on token change with debounced disconnect.
  - Deleted obsolete hooks: `client/src/hooks/useFirestore.js` and `client/src/hooks/useGetRoomInfo.js`.
- **Page Rewrites:**
  - `client/src/Pages/Home.jsx`: Decoupled from Firestore; loads `/me`, `/me/friends`, `/me/conversations`; realtime presence diffs, user search, group create, status updates.
  - `client/src/Pages/Chat.jsx`: Keyset message pagination (`?before=`), optimistic sending with 5s timeout, read receipts (`socket.emit("read")`), debounced typing indicators, moderation placeholder (`"Message hidden due to content moderation"`), zero `localStorage` message caching.
  - `client/src/Pages/video-call.jsx`: Scoped WebRTC signaling using shared socket instance.
  - `client/src/Firebase/firebase.js`: Removed `getFirestore`/`db`; configured Firebase Auth emulator in dev; guarded messaging/analytics.
- **Verification Gates Passed:**
  - `grep -rn "firebase/firestore" client/src/` $\to$ **0 matches**.
  - `grep -rn "localStorage.*messages_|localStorage.*room_" client/src/` $\to$ **0 matches**.
  - `grep -rn "useFirestore|useGetRoomInfo" client/src/` $\to$ **0 matches**.
  - `grep -rn "io(" client/src/` $\to$ **Exactly 1 match** in `useSocket.js`.
  - `npm run build` $\to$ **Passed cleanly** (1,767 modules transformed in 6.46s).

---

### 10.2 What is left to do (Phases 0c – 6)

```
[Phase 0a: Server Foundation] ──> COMPLETE
[Phase 0b: Client Migration]  ──> COMPLETE
             │
             ├──> [Phase 0c: Staging Deployment] (Optional staging validation on Render/Neon branch/Vercel preview)
             │
             └──> [Phase 1: Announce & Freeze] (Git tag 'pre-postgres', VITE_MAINTENANCE=1, 5-min zero writes)
                    │
                    └──> [Phase 2: Data Migration (ETL)] (extract.js, transform.js, load.js, verify.js, rehearsals)
                           │
                           └──> [Phase 3: Production Cutover] (prisma migrate deploy, Render deploy, Vercel deploy)
                                  │
                                  └──> [Phase 4: Smoke Testing] (Run Smoke Checklist 6.2 on production)
                                         │
                                         └──> [Phase 5: 7-Day Bake Period] (Firestore read-only, log monitoring)
                                                │
                                                └──> [Phase 6: Decommission] (Archive GCS export, drop Firestore)
```

| Phase | Milestone | Deliverables / Actions Required |
|---|---|---|
| **Phase 0c** | **Staging Deployment** *(Optional)* | 1. Create a Neon DB development/staging branch.<br>2. Deploy server to a staging Render Web Service with staging DB URL.<br>3. Deploy client to a Vercel Preview branch pointing `VITE_API_URL` to staging Render.<br>4. Run Smoke Checklist 6.2 with seeded accounts. |
| **Phase 1** | **Announce & Freeze** | 1. Git tag `pre-postgres` across repo.<br>2. Build and deploy client maintenance gate (`VITE_MAINTENANCE=1`).<br>3. Verify zero Firestore writes for 5 minutes (`T_freeze`). |
| **Phase 2** | **Data Migration (ETL)** | 1. Implement ETL scripts in `server/scripts/migrate/` (`extract.js`, `transform.js`, `load.js`, `verify.js`, `reverse-etl.js`).<br>2. Populate `overrides.csv` for resolving ambiguous chat keys.<br>3. Run 2 timed rehearsals against staging DB to determine cutover window duration.<br>4. Perform production Firestore export (`gcloud firestore export`) and ETL load into production Neon Postgres.<br>5. Run `pg_dump` backup of loaded database. |
| **Phase 3** | **Production Cutover** | 1. Set production environment variables on Render (`DATABASE_URL`, `DIRECT_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT`, `CORS_ORIGIN`, `PORT`).<br>2. Run `npx prisma migrate deploy` on production Neon database.<br>3. Deploy production server to Render; verify `GET /healthz` returns HTTP 200 `{ ok: true, mode: "prod", db: "up" }`.<br>4. Deploy production client to Vercel with `VITE_MAINTENANCE=0` and production `VITE_API_URL`. |
| **Phase 4** | **Production Smoke Testing** | 1. Execute Smoke Checklist 6.2 end-to-end with two real production accounts. |
| **Phase 5** | **7-Day Bake Period** | 1. Set Firestore security rules to read-only (`allow write: if false;`).<br>2. Monitor Render backend logs and Neon query latency.<br>3. Monitor for unhandled exceptions or user reports of missing conversations. |
| **Phase 6** | **Decommission & Cleanup** | 1. Ensure Firestore export is retained in Google Cloud Storage for 90 days.<br>2. Delete Cloud Firestore database collections.<br>3. Drop temporary `migration_log` table from PostgreSQL.<br>4. Clean up any lingering legacy code branches. |
