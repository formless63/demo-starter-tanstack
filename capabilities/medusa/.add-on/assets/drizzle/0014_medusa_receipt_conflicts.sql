ALTER TABLE "medusa_inbox" ADD COLUMN "conflict_digest" varchar(64);--> statement-breakpoint
ALTER TABLE "medusa_inbox" ADD COLUMN "reconcile_again" boolean DEFAULT false NOT NULL;