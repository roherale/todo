CREATE TYPE "public"."client_type" AS ENUM('web', 'cli', 'mcp');--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"client_type" "client_type" NOT NULL,
	"id_hash" text NOT NULL,
	"refresh_token_enc" text,
	"key_version" integer,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "sessions_id_hash_unique" UNIQUE("id_hash")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");