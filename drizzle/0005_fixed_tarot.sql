CREATE TABLE "proformas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"total_minor" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"invoice_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proformas_number_idx" ON "proformas" USING btree ("number");--> statement-breakpoint
CREATE INDEX "proformas_issued_at_idx" ON "proformas" USING btree ("issued_at");