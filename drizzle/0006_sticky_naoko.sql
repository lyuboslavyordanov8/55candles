CREATE TABLE "accountant_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"requirements" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text DEFAULT '' NOT NULL,
	"period" text DEFAULT '' NOT NULL,
	"actor" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"overridden_at" timestamp with time zone,
	"overridden_by" text,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"supplier" text NOT NULL,
	"supplier_eik" text DEFAULT '' NOT NULL,
	"document_number" text DEFAULT '' NOT NULL,
	"document_date" timestamp with time zone NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"net_minor" integer,
	"vat_shown_minor" integer,
	"total_minor" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"payment_method" text DEFAULT 'card' NOT NULL,
	"status" text DEFAULT 'needs_review' NOT NULL,
	"document_missing" boolean DEFAULT true NOT NULL,
	"period" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "accounting_events_period_idx" ON "accounting_events" USING btree ("period");--> statement-breakpoint
CREATE INDEX "accounting_events_created_at_idx" ON "accounting_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_periods_period_idx" ON "accounting_periods" USING btree ("period");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_reference_idx" ON "expenses" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "expenses_period_idx" ON "expenses" USING btree ("period");--> statement-breakpoint
CREATE INDEX "expenses_document_date_idx" ON "expenses" USING btree ("document_date");--> statement-breakpoint
CREATE INDEX "expenses_supplier_idx" ON "expenses" USING btree ("supplier");