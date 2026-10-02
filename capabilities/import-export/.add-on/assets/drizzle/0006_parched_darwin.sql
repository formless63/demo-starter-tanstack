CREATE TABLE "import_export_transfer" (
	"id" uuid PRIMARY KEY NOT NULL,
	"requester_id" varchar(128) NOT NULL,
	"scope_kind" varchar(6) NOT NULL,
	"scope_id" varchar(128) NOT NULL,
	"definition" varchar(64) NOT NULL,
	"version" varchar(64) NOT NULL,
	"direction" varchar(6) NOT NULL,
	"status" varchar(12) NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"started_at" timestamp (3) with time zone,
	"completed_at" timestamp (3) with time zone,
	"snapshot_at" timestamp (3) with time zone,
	"artifact_expires_at" timestamp (3) with time zone,
	"idempotency_key" varchar(128),
	"fingerprint" varchar(64),
	"source_hash" varchar(64),
	"source_length" integer,
	"source_key" text,
	"output_key" text,
	"job_id" uuid,
	"job_queue" varchar(64),
	"row_count" integer,
	"byte_count" integer,
	"error_code" varchar(32),
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"errors_truncated" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_request_key_idx" ON "import_export_transfer" USING btree ("requester_id","scope_kind","scope_id","direction","idempotency_key");--> statement-breakpoint
CREATE INDEX "transfer_visibility_time_idx" ON "import_export_transfer" USING btree ("requester_id","scope_kind","scope_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);