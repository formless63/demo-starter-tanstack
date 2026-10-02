CREATE TABLE "medusa_binding" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope_kind" varchar(6) NOT NULL,
	"scope_id" varchar(128) NOT NULL,
	"local_resource_id" varchar(128) NOT NULL,
	"connection_id" varchar(64) NOT NULL,
	"resource_kind" varchar(7) NOT NULL,
	"remote_id" varchar(128) NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"retired_at" timestamp (3) with time zone,
	"revision" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp (3) with time zone,
	CONSTRAINT "medusa_binding_kind" CHECK ("medusa_binding"."resource_kind" in ('product','order')),
	CONSTRAINT "medusa_binding_scope" CHECK ("medusa_binding"."scope_kind" in ('user','tenant'))
);
--> statement-breakpoint
CREATE TABLE "medusa_inbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"connection_id" varchar(64) NOT NULL,
	"event_id" uuid NOT NULL,
	"body_sha256" varchar(64) NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"binding_id" uuid,
	"remote_hint" varchar(128),
	"state" varchar(12) NOT NULL,
	"received_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"attempt_token" uuid,
	"lease_until" timestamp (3) with time zone,
	"error_code" varchar(24),
	CONSTRAINT "medusa_inbox_state" CHECK ("medusa_inbox"."state" in ('received','processing','processed','ignored','failed'))
);
--> statement-breakpoint
CREATE TABLE "medusa_operation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope_kind" varchar(6) NOT NULL,
	"scope_id" varchar(128) NOT NULL,
	"actor_user_id" varchar(128) NOT NULL,
	"connection_id" varchar(64) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"binding_id" uuid,
	"caller_key" varchar(128) NOT NULL,
	"digest" varchar(64) NOT NULL,
	"intent" jsonb NOT NULL,
	"status" varchar(24) NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"first_dispatch_at" timestamp (3) with time zone,
	"attempt_token" uuid,
	"lease_until" timestamp (3) with time zone,
	"revision" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(24),
	"processed" integer DEFAULT 0 NOT NULL,
	"next_cursor" text,
	CONSTRAINT "medusa_operation_kind" CHECK ("medusa_operation"."kind" in ('reconcile_product','reconcile_order','sync_product_page','sync_order_page')),
	CONSTRAINT "medusa_operation_status" CHECK ("medusa_operation"."status" in ('queued','dispatching','succeeded','failed','reconciliation_required','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "medusa_projection" (
	"binding_id" uuid PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"synced_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "medusa_inbox" ADD CONSTRAINT "medusa_inbox_binding_id_medusa_binding_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."medusa_binding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medusa_operation" ADD CONSTRAINT "medusa_operation_binding_id_medusa_binding_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."medusa_binding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medusa_projection" ADD CONSTRAINT "medusa_projection_binding_id_medusa_binding_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."medusa_binding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "medusa_binding_remote_unique" ON "medusa_binding" USING btree ("connection_id","resource_kind","remote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "medusa_binding_local_active_unique" ON "medusa_binding" USING btree ("scope_kind","scope_id","resource_kind","local_resource_id") WHERE "medusa_binding"."retired_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "medusa_inbox_event_unique" ON "medusa_inbox" USING btree ("connection_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "medusa_operation_intent_unique" ON "medusa_operation" USING btree ("scope_kind","scope_id","connection_id","kind","caller_key");--> statement-breakpoint
CREATE INDEX "medusa_projection_page_idx" ON "medusa_projection" USING btree ("created_at" DESC NULLS LAST,"binding_id" DESC NULLS LAST);