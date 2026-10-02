CREATE TABLE "stripe_binding" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope_kind" varchar(6) NOT NULL,
	"scope_id" varchar(128) NOT NULL,
	"local_resource_id" varchar(128) NOT NULL,
	"connection_id" varchar(64) NOT NULL,
	"resource_kind" varchar(8) NOT NULL,
	"remote_id" varchar(128) NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"retired_at" timestamp (3) with time zone,
	"revision" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "stripe_inbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"connection_id" varchar(64) NOT NULL,
	"account_id" varchar(128) NOT NULL,
	"mode" varchar(4) NOT NULL,
	"event_id" varchar(128) NOT NULL,
	"body_sha256" varchar(64) NOT NULL,
	"event_type" text NOT NULL,
	"binding_id" uuid,
	"remote_hint" varchar(128),
	"state" varchar(12) NOT NULL,
	"received_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"attempt_token" uuid,
	"lease_until" timestamp (3) with time zone,
	"error_code" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "stripe_operation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope_kind" varchar(6) NOT NULL,
	"scope_id" varchar(128) NOT NULL,
	"actor_user_id" varchar(128) NOT NULL,
	"connection_id" varchar(64) NOT NULL,
	"kind" varchar(24) NOT NULL,
	"caller_key" varchar(128) NOT NULL,
	"digest" varchar(64) NOT NULL,
	"binding_id" uuid,
	"source_binding_id" uuid NOT NULL,
	"status" varchar(24) NOT NULL,
	"intent" jsonb,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"first_dispatch_at" timestamp (3) with time zone,
	"attempt_token" uuid,
	"lease_until" timestamp (3) with time zone,
	"revision" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "stripe_projection" (
	"binding_id" uuid PRIMARY KEY NOT NULL,
	"checkout" jsonb,
	"payment" jsonb,
	"synced_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stripe_inbox" ADD CONSTRAINT "stripe_inbox_binding_id_stripe_binding_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."stripe_binding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_operation" ADD CONSTRAINT "stripe_operation_binding_id_stripe_binding_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."stripe_binding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_operation" ADD CONSTRAINT "stripe_operation_source_binding_id_stripe_binding_id_fk" FOREIGN KEY ("source_binding_id") REFERENCES "public"."stripe_binding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_projection" ADD CONSTRAINT "stripe_projection_binding_id_stripe_binding_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."stripe_binding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_binding_local_idx" ON "stripe_binding" USING btree ("scope_kind","scope_id","local_resource_id","resource_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_binding_remote_idx" ON "stripe_binding" USING btree ("connection_id","resource_kind","remote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_inbox_receipt_idx" ON "stripe_inbox" USING btree ("account_id","mode","event_id");--> statement-breakpoint
CREATE INDEX "stripe_inbox_recovery_idx" ON "stripe_inbox" USING btree ("state","lease_until");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_operation_key_idx" ON "stripe_operation" USING btree ("scope_kind","scope_id","connection_id","kind","caller_key");--> statement-breakpoint
CREATE INDEX "stripe_operation_recovery_idx" ON "stripe_operation" USING btree ("status","lease_until");