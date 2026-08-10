CREATE TYPE "public"."courier" AS ENUM('econt', 'speedy');--> statement-breakpoint
CREATE TYPE "public"."delivery_method" AS ENUM('door', 'office', 'locker');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'pending_payment', 'payment_failed', 'paid', 'awaiting_cod', 'confirmed', 'packed', 'shipped', 'delivered', 'cod_collected', 'reconciled', 'refused_at_delivery', 'returned', 'cancelled', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('card', 'cod');--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"granted" boolean NOT NULL,
	"policy_version" text DEFAULT '' NOT NULL,
	"ip_address" text,
	"source" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_slug" text NOT NULL,
	"name" text NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_minor" integer NOT NULL,
	"unit_weight_grams" integer NOT NULL,
	"vat_rate_basis_points" integer
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"intent_token" text NOT NULL,
	"public_token" text NOT NULL,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"recipient_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"country" text DEFAULT 'BG' NOT NULL,
	"city" text NOT NULL,
	"post_code" text NOT NULL,
	"street" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"courier" "courier" NOT NULL,
	"delivery_method" "delivery_method" NOT NULL,
	"office_id" text DEFAULT '' NOT NULL,
	"office_name" text DEFAULT '' NOT NULL,
	"office_address" text DEFAULT '' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"goods_minor" integer NOT NULL,
	"shipping_minor" integer NOT NULL,
	"cod_fee_minor" integer,
	"total_minor" integer NOT NULL,
	"weight_grams" integer NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_checkout_session_id" text,
	"paid_at" timestamp with time zone,
	"waybill_number" text,
	"tracking_url" text,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_records_email_idx" ON "consent_records" USING btree ("email");--> statement-breakpoint
CREATE INDEX "order_events_order_id_idx" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_idx" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_intent_token_idx" ON "orders" USING btree ("intent_token");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_waybill_idx" ON "orders" USING btree ("waybill_number");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_event_id_idx" ON "webhook_events" USING btree ("event_id");