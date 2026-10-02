CREATE TABLE "invoice_ninja_binding" (
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
	CONSTRAINT "invoice_ninja_binding_scope" CHECK ("invoice_ninja_binding"."scope_kind" in ('user','tenant')),
	CONSTRAINT "invoice_ninja_binding_kind" CHECK ("invoice_ninja_binding"."resource_kind" in ('client','invoice'))
);
--> statement-breakpoint
CREATE TABLE "invoice_ninja_client" (
	"binding_id" uuid PRIMARY KEY NOT NULL,
	"synced_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_ninja_inbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"connection_id" varchar(64) NOT NULL,
	"event_kind" varchar(24) NOT NULL,
	"body_sha256" varchar(64) NOT NULL,
	"remote_hint" varchar(128) NOT NULL,
	"binding_id" uuid,
	"state" varchar(12) NOT NULL,
	"received_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp (3) with time zone,
	"error_code" varchar(24),
	CONSTRAINT "invoice_ninja_inbox_state" CHECK ("invoice_ninja_inbox"."state" in ('received','processing','processed','ignored','failed'))
);
--> statement-breakpoint
CREATE TABLE "invoice_ninja_invoice" (
	"binding_id" uuid PRIMARY KEY NOT NULL,
	"number" varchar(128),
	"status" varchar(12) NOT NULL,
	"currency" varchar(3),
	"amount" varchar(35),
	"balance" varchar(35),
	"source_updated_at" timestamp (3) with time zone,
	"synced_at" timestamp (3) with time zone NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "invoice_ninja_invoice_status" CHECK ("invoice_ninja_invoice"."status" in ('draft','sent','partial','paid','cancelled','reversed','deleted','unknown'))
);
--> statement-breakpoint
CREATE TABLE "invoice_ninja_operation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope_kind" varchar(6) NOT NULL,
	"scope_id" varchar(128) NOT NULL,
	"actor_user_id" varchar(128) NOT NULL,
	"connection_id" varchar(64) NOT NULL,
	"kind" varchar(24) NOT NULL,
	"status" varchar(24) NOT NULL,
	"binding_id" uuid,
	"caller_key" varchar(128) NOT NULL,
	"digest" varchar(64) NOT NULL,
	"intent" jsonb,
	"remote_id" varchar(128),
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"first_dispatch_at" timestamp (3) with time zone,
	"lease_token" uuid,
	"lease_until" timestamp (3) with time zone,
	"revision" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(24),
	CONSTRAINT "invoice_ninja_operation_status" CHECK ("invoice_ninja_operation"."status" in ('queued','dispatching','succeeded','failed','reconciliation_required','cancelled')),
	CONSTRAINT "invoice_ninja_operation_kind" CHECK ("invoice_ninja_operation"."kind" in ('create_draft','reconcile_client','reconcile_invoice'))
);
--> statement-breakpoint
ALTER TABLE "invoice_ninja_client" ADD CONSTRAINT "invoice_ninja_client_binding_id_invoice_ninja_binding_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."invoice_ninja_binding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_ninja_inbox" ADD CONSTRAINT "invoice_ninja_inbox_binding_id_invoice_ninja_binding_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."invoice_ninja_binding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_ninja_invoice" ADD CONSTRAINT "invoice_ninja_invoice_binding_id_invoice_ninja_binding_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."invoice_ninja_binding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_ninja_operation" ADD CONSTRAINT "invoice_ninja_operation_binding_id_invoice_ninja_binding_id_fk" FOREIGN KEY ("binding_id") REFERENCES "public"."invoice_ninja_binding"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_ninja_binding_local" ON "invoice_ninja_binding" USING btree ("scope_kind","scope_id","resource_kind","local_resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_ninja_binding_remote" ON "invoice_ninja_binding" USING btree ("connection_id","resource_kind","remote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_ninja_receipt_identity" ON "invoice_ninja_inbox" USING btree ("connection_id","event_kind","body_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_ninja_operation_key" ON "invoice_ninja_operation" USING btree ("scope_kind","scope_id","connection_id","kind","caller_key");--> statement-breakpoint
CREATE INDEX "invoice_ninja_operation_recovery" ON "invoice_ninja_operation" USING btree ("status","lease_until");