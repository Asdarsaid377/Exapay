CREATE TYPE "public"."kpi_indicator_type" AS ENUM('numeric', 'count', 'rating', 'system');--> statement-breakpoint
CREATE TYPE "public"."kpi_system_metric" AS ENUM('attendance_rate');--> statement-breakpoint
CREATE TYPE "public"."kpi_target_period" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TABLE "kpi_indicators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"sort_order" smallint NOT NULL,
	"name" text NOT NULL,
	"type" "kpi_indicator_type" NOT NULL,
	"unit" text,
	"target" numeric(18, 2) NOT NULL,
	"target_period" "kpi_target_period",
	"system_metric" "kpi_system_metric",
	"weight" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_indicators_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "kpi_indicators_weight" CHECK ("kpi_indicators"."weight" BETWEEN 1 AND 100),
	CONSTRAINT "kpi_indicators_target_positive" CHECK ("kpi_indicators"."target" > 0),
	CONSTRAINT "kpi_indicators_type_fields" CHECK (CASE "kpi_indicators"."type"
        WHEN 'numeric' THEN "kpi_indicators"."unit" IS NOT NULL AND "kpi_indicators"."target_period" IS NOT NULL AND "kpi_indicators"."system_metric" IS NULL
        WHEN 'count' THEN "kpi_indicators"."unit" IS NOT NULL AND "kpi_indicators"."target_period" IS NOT NULL AND "kpi_indicators"."system_metric" IS NULL AND "kpi_indicators"."target" = trunc("kpi_indicators"."target")
        WHEN 'rating' THEN "kpi_indicators"."unit" IS NULL AND "kpi_indicators"."target_period" IS NULL AND "kpi_indicators"."system_metric" IS NULL AND "kpi_indicators"."target" = 5
        WHEN 'system' THEN "kpi_indicators"."unit" IS NULL AND "kpi_indicators"."target_period" IS NULL AND "kpi_indicators"."system_metric" IS NOT NULL AND "kpi_indicators"."target" <= 100
      END)
);
--> statement-breakpoint
CREATE TABLE "kpi_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"builtin_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_templates_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "kpi_template_id" uuid;--> statement-breakpoint
ALTER TABLE "kpi_indicators" ADD CONSTRAINT "kpi_indicators_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_indicators" ADD CONSTRAINT "kpi_indicators_template_fk" FOREIGN KEY ("tenant_id","template_id") REFERENCES "public"."kpi_templates"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_templates" ADD CONSTRAINT "kpi_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kpi_indicators_tenant_template_idx" ON "kpi_indicators" USING btree ("tenant_id","template_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_templates_tenant_name_key" ON "kpi_templates" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_templates_tenant_builtin_key" ON "kpi_templates" USING btree ("tenant_id","builtin_key") WHERE "kpi_templates"."builtin_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_kpi_template_fk" FOREIGN KEY ("tenant_id","kpi_template_id") REFERENCES "public"."kpi_templates"("tenant_id","id") ON DELETE SET NULL ("kpi_template_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "positions_tenant_kpi_template_idx" ON "positions" USING btree ("tenant_id","kpi_template_id");--> statement-breakpoint

-- ---- kpi_templates & kpi_indicators: tabel tenant biasa ----
-- Index unik (tenant_id, id) / (tenant_id, template_id, sort_order) melayani filter tenant_id — tanpa index tenant_id terpisah.
-- Target rating = 5 di CHECK = KPI_RATING_SCALE_MAX (@exapay/shared); ganti skala = migration baru.
-- FK jabatan → template: ON DELETE SET NULL ("kpi_template_id") (PG 15+) — hanya kolom template yang dikosongkan,
-- SET NULL biasa akan mengosongkan tenant_id juga dan melanggar NOT NULL.
-- Aturan "total bobot = 100%" divalidasi di API (zod) sebelum menulis seluruh indikator dalam satu transaksi.
ALTER TABLE "kpi_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kpi_templates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "kpi_templates"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "kpi_templates_set_updated_at" BEFORE UPDATE ON "kpi_templates"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
ALTER TABLE "kpi_indicators" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kpi_indicators" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "kpi_indicators"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "kpi_indicators_set_updated_at" BEFORE UPDATE ON "kpi_indicators"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "kpi_templates", "kpi_indicators" TO app_user;
