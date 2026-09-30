CREATE TYPE "public"."kpi_review_cycle" AS ENUM('weekly', 'monthly', 'quarterly');--> statement-breakpoint
CREATE TYPE "public"."kpi_review_status" AS ENUM('draft', 'reviewed', 'final');--> statement-breakpoint
CREATE TABLE "kpi_review_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cycle" "kpi_review_cycle" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_review_periods_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "kpi_review_periods_date_order" CHECK ("kpi_review_periods"."end_date" >= "kpi_review_periods"."start_date")
);
--> statement-breakpoint
CREATE TABLE "kpi_review_ratings" (
	"tenant_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"indicator_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_review_ratings_pkey" PRIMARY KEY("tenant_id","review_id","indicator_id"),
	CONSTRAINT "kpi_review_ratings_range" CHECK ("kpi_review_ratings"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "kpi_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"status" "kpi_review_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"submitted_by_user_id" uuid,
	"submitted_by_name" text,
	"finalized_at" timestamp with time zone,
	"finalized_by_user_id" uuid,
	"finalized_by_name" text,
	"final_score" numeric(4, 1),
	"final_predicate" text,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_reviews_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "kpi_reviews_tenant_period_employee_key" UNIQUE("tenant_id","period_id","employee_id"),
	CONSTRAINT "kpi_reviews_submitted" CHECK (("kpi_reviews"."status" <> 'draft') = ("kpi_reviews"."submitted_at" IS NOT NULL)),
	CONSTRAINT "kpi_reviews_final" CHECK (("kpi_reviews"."status" = 'final') = ("kpi_reviews"."finalized_at" IS NOT NULL) AND ("kpi_reviews"."status" = 'final') = ("kpi_reviews"."snapshot" IS NOT NULL)
        AND ("kpi_reviews"."final_score" IS NULL) = ("kpi_reviews"."final_predicate" IS NULL) AND ("kpi_reviews"."status" = 'final' OR "kpi_reviews"."final_score" IS NULL)
        AND coalesce("kpi_reviews"."final_score" BETWEEN 0 AND 100, true)),
	CONSTRAINT "kpi_reviews_final_predicate" CHECK ("kpi_reviews"."final_predicate" IS NULL OR "kpi_reviews"."final_predicate" IN ('very_good', 'good', 'fair', 'needs_improvement'))
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "kpi_review_cycle" "kpi_review_cycle" DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "kpi_review_periods" ADD CONSTRAINT "kpi_review_periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_review_periods" ADD CONSTRAINT "kpi_review_periods_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_review_ratings" ADD CONSTRAINT "kpi_review_ratings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_review_ratings" ADD CONSTRAINT "kpi_review_ratings_review_fk" FOREIGN KEY ("tenant_id","review_id") REFERENCES "public"."kpi_reviews"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_review_ratings" ADD CONSTRAINT "kpi_review_ratings_indicator_fk" FOREIGN KEY ("tenant_id","indicator_id") REFERENCES "public"."kpi_indicators"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_finalized_by_user_id_users_id_fk" FOREIGN KEY ("finalized_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_period_fk" FOREIGN KEY ("tenant_id","period_id") REFERENCES "public"."kpi_review_periods"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kpi_review_periods_tenant_start_idx" ON "kpi_review_periods" USING btree ("tenant_id","start_date");--> statement-breakpoint
CREATE INDEX "kpi_review_ratings_tenant_indicator_idx" ON "kpi_review_ratings" USING btree ("tenant_id","indicator_id");--> statement-breakpoint
CREATE INDEX "kpi_reviews_tenant_employee_idx" ON "kpi_reviews" USING btree ("tenant_id","employee_id");--> statement-breakpoint

-- ---- Siklus penilaian (feature 22): kolom tenants baru, default bulanan untuk semua usaha lama & baru.
-- Grant UPDATE tenants ke app_user (0000) & policy tenant_isolation sudah mencakup kolom ini (owner/admin dicek API).

-- ---- Periode satu usaha tidak boleh beririsan (rentang inklusif). btree_gist sudah dibuat di 0013.
ALTER TABLE "kpi_review_periods" ADD CONSTRAINT "kpi_review_periods_no_overlap" EXCLUDE USING gist (
  "tenant_id" WITH =,
  daterange("start_date", "end_date", '[]') WITH &&
);--> statement-breakpoint

-- ---- Penilaian final terkunci: tidak bisa diubah/dihapus siapa pun lewat app_user (snapshot immutable).
CREATE FUNCTION public.kpi_reviews_guard_final() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'penilaian KPI final terkunci' USING ERRCODE = 'insufficient_privilege';
END $$;--> statement-breakpoint
CREATE TRIGGER "kpi_reviews_guard_final" BEFORE UPDATE OR DELETE ON "kpi_reviews"
  FOR EACH ROW WHEN (OLD.status = 'final') EXECUTE FUNCTION public.kpi_reviews_guard_final();--> statement-breakpoint

-- ---- Tabel tenant biasa. Filter tenant dilayani index (tenant_id, …) masing-masing tabel.
ALTER TABLE "kpi_review_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kpi_review_periods" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "kpi_review_periods"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "kpi_review_periods_set_updated_at" BEFORE UPDATE ON "kpi_review_periods"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- Periode tidak diubah/dihapus (penilaian menunjuk ke periode)
GRANT SELECT, INSERT ON "kpi_review_periods" TO app_user;--> statement-breakpoint

ALTER TABLE "kpi_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kpi_reviews" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "kpi_reviews"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "kpi_reviews_set_updated_at" BEFORE UPDATE ON "kpi_reviews"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- Tanpa DELETE: penilaian tidak dihapus. Transisi status dijaga service (audit kpi_review)
GRANT SELECT, INSERT, UPDATE ON "kpi_reviews" TO app_user;--> statement-breakpoint

ALTER TABLE "kpi_review_ratings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kpi_review_ratings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "kpi_review_ratings"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "kpi_review_ratings_set_updated_at" BEFORE UPDATE ON "kpi_review_ratings"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- DELETE: nilai diganti seluruhnya saat disimpan (hanya penilaian draft, dicek service)
GRANT SELECT, INSERT, UPDATE, DELETE ON "kpi_review_ratings" TO app_user;
