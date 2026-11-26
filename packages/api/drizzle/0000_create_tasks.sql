CREATE TYPE "public"."task_status" AS ENUM('new', 'queued', 'in_progress', 'paused', 'completed');--> statement-breakpoint
CREATE TABLE "task_counters" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"status" "task_status" DEFAULT 'new' NOT NULL,
	"due_at" timestamp with time zone,
	"due_all_day" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_owner_number_unique" UNIQUE("owner_id","number")
);
--> statement-breakpoint
CREATE INDEX "tasks_owner_id_idx" ON "tasks" USING btree ("owner_id","id");