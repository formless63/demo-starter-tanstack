CREATE TABLE "feature_flag" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"default_value" boolean DEFAULT false NOT NULL,
	"rollout_basis_points" integer,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "feature_flag_revision" CHECK ("feature_flag"."revision">0),
	CONSTRAINT "feature_flag_rollout" CHECK ("feature_flag"."rollout_basis_points" IS NULL OR "feature_flag"."rollout_basis_points" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "feature_flag_override" (
	"id" uuid PRIMARY KEY NOT NULL,
	"flag_key" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"value" boolean NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "feature_flag_override_kind" CHECK ("feature_flag_override"."target_kind" IN ('user','tenant'))
);
--> statement-breakpoint
ALTER TABLE "feature_flag_override" ADD CONSTRAINT "feature_flag_override_flag_key_feature_flag_key_fk" FOREIGN KEY ("flag_key") REFERENCES "public"."feature_flag"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feature_flag_created" ON "feature_flag" USING btree ("created_at","key");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flag_override_target" ON "feature_flag_override" USING btree ("flag_key","target_kind","target_id");--> statement-breakpoint
CREATE INDEX "feature_flag_override_created" ON "feature_flag_override" USING btree ("flag_key","created_at","id");