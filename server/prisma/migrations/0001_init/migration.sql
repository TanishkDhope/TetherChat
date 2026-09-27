-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Enums
CREATE TYPE "FriendshipStatus" AS ENUM ('pending', 'accepted', 'blocked');
CREATE TYPE "ConversationKind" AS ENUM ('dm', 'group');
CREATE TYPE "MemberRole" AS ENUM ('owner', 'member');
CREATE TYPE "MessageKind" AS ENUM ('text', 'sticker');

-- Tables
CREATE TABLE "users" (
  "id" text NOT NULL,
  "email" citext NOT NULL,
  "display_name" text NOT NULL,
  "avatar_url" text,
  "bio" text,
  "status_text" text,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_display_name_check" CHECK (length("display_name") BETWEEN 1 AND 80)
);

CREATE TABLE "friendships" (
  "user_lo" text NOT NULL,
  "user_hi" text NOT NULL,
  "requested_by" text NOT NULL,
  "status" "FriendshipStatus" NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "responded_at" timestamptz,

  CONSTRAINT "friendships_pkey" PRIMARY KEY ("user_lo", "user_hi"),
  CONSTRAINT "friendships_order_check" CHECK ("user_lo" < "user_hi"),
  CONSTRAINT "friendships_requested_by_check" CHECK ("requested_by" IN ("user_lo", "user_hi"))
);

CREATE TABLE "conversations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "kind" "ConversationKind" NOT NULL,
  "name" text,
  "avatar_url" text,
  "created_by" text,
  "dm_key" text,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversations_dm_key_check" CHECK (("kind" = 'dm') = ("dm_key" IS NOT NULL)),
  CONSTRAINT "conversations_group_name_check" CHECK ("kind" = 'dm' OR "name" IS NOT NULL)
);

CREATE TABLE "conversation_members" (
  "conversation_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "role" "MemberRole" NOT NULL DEFAULT 'member',
  "joined_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_read_message_id" bigint,

  CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conversation_id", "user_id")
);

CREATE TABLE "messages" (
  "id" bigserial NOT NULL,
  "conversation_id" uuid NOT NULL,
  "sender_id" text,
  "kind" "MessageKind" NOT NULL DEFAULT 'text',
  "body" text NOT NULL,
  "is_moderated" boolean NOT NULL DEFAULT false,
  "moderation_reason" text,
  "client_msg_id" text,
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_body_check" CHECK (length("body") BETWEEN 1 AND 4000),
  CONSTRAINT "messages_conversation_id_sender_id_client_msg_id_key" UNIQUE ("conversation_id", "sender_id", "client_msg_id")
);

-- Foreign Keys
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_lo_fkey" FOREIGN KEY ("user_lo") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_hi_fkey" FOREIGN KEY ("user_hi") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_last_read_message_id_fkey" FOREIGN KEY ("last_read_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE INDEX "friendships_user_hi_idx" ON "friendships"("user_hi");
CREATE INDEX "friendships_pending_idx" ON "friendships"("user_lo", "user_hi") WHERE "status" = 'pending';

CREATE UNIQUE INDEX "conversations_dm_key_key" ON "conversations"("dm_key");
CREATE INDEX "conversations_updated_at_idx" ON "conversations"("updated_at" DESC);

CREATE INDEX "conversation_members_user_id_idx" ON "conversation_members"("user_id");

CREATE INDEX "messages_conversation_id_id_idx" ON "messages"("conversation_id", "id" DESC);
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- Functions & Triggers
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_touch ON "users";
CREATE TRIGGER users_touch BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
