CREATE TYPE "public"."ai_generation_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."kpi_summary_source" AS ENUM('ai', 'edited', 'manual');--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"status" "ai_generation_status" DEFAULT 'queued' NOT NULL,
	"input" jsonb NOT NULL,
	"output" text,
	"error" text,
	"provider" text,
	"model" text,
	"prompt_version" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"requested_by_user_id" uuid,
	"requested_by_name" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_generations_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "ai_generations_output" CHECK (("ai_generations"."status" = 'succeeded') = ("ai_generations"."output" IS NOT NULL) AND ("ai_generations"."status" = 'failed') = ("ai_generations"."error" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "kpi_review_summaries" (
	"tenant_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"body" text,
	"source" "kpi_summary_source",
	"generation_id" uuid,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" uuid,
	"reviewed_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_review_summaries_pkey" PRIMARY KEY("tenant_id","review_id"),
	CONSTRAINT "kpi_review_summaries_body" CHECK (("kpi_review_summaries"."body" IS NULL) = ("kpi_review_summaries"."source" IS NULL) AND ("kpi_review_summaries"."body" IS NULL OR char_length("kpi_review_summaries"."body") BETWEEN 1 AND 4000)
        AND ("kpi_review_summaries"."reviewed_at" IS NULL OR "kpi_review_summaries"."body" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "ai_summary_monthly_quota" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_review_fk" FOREIGN KEY ("tenant_id","review_id") REFERENCES "public"."kpi_reviews"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_review_summaries" ADD CONSTRAINT "kpi_review_summaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_review_summaries" ADD CONSTRAINT "kpi_review_summaries_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_review_summaries" ADD CONSTRAINT "kpi_review_summaries_review_fk" FOREIGN KEY ("tenant_id","review_id") REFERENCES "public"."kpi_reviews"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_review_summaries" ADD CONSTRAINT "kpi_review_summaries_generation_fk" FOREIGN KEY ("tenant_id","generation_id") REFERENCES "public"."ai_generations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generations_tenant_created_idx" ON "ai_generations" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_generations_tenant_review_idx" ON "ai_generations" USING btree ("tenant_id","review_id");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_ai_summary_monthly_quota" CHECK ("tenants"."ai_summary_monthly_quota" >= 0);--> statement-breakpoint

-- =====================================================================
-- Bagian custom (ditulis manual): ringkasan AI penilaian KPI (feature 23).
-- =====================================================================

-- ---- tenants.ai_summary_monthly_quota: hanya super-admin (atau app_owner) yang boleh mengubah ----
-- Policy tenant_isolation mengizinkan anggota tenant meng-update baris tenant-nya; trigger ini mencegah bug di API menaikkan
-- kuota sendiri. Kolom baru mendapat default 200 untuk semua usaha lama & baru.
CREATE FUNCTION public.guard_tenant_ai_quota() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.ai_summary_monthly_quota IS DISTINCT FROM OLD.ai_summary_monthly_quota
     AND current_user <> 'app_owner'
     AND NOT public.current_app_is_super_admin() THEN
    RAISE EXCEPTION 'kuota AI hanya boleh diubah super-admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "tenants_guard_ai_quota" BEFORE UPDATE ON "tenants"
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_ai_quota();--> statement-breakpoint

-- ---- Narasi penilaian final terkunci (narasi sudah disalin ke snapshot kpi_reviews) ----
CREATE FUNCTION public.kpi_review_summaries_guard_final() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  target uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.review_id ELSE NEW.review_id END;
BEGIN
  IF EXISTS (SELECT 1 FROM public.kpi_reviews WHERE id = target AND status = 'final') THEN
    RAISE EXCEPTION 'narasi penilaian KPI final terkunci' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;--> statement-breakpoint
CREATE TRIGGER "kpi_review_summaries_guard_final" BEFORE INSERT OR UPDATE OR DELETE ON "kpi_review_summaries"
  FOR EACH ROW EXECUTE FUNCTION public.kpi_review_summaries_guard_final();--> statement-breakpoint

-- ---- Tabel tenant biasa. Filter tenant dilayani index (tenant_id, …) masing-masing tabel.
ALTER TABLE "ai_generations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_generations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ai_generations"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "ai_generations_set_updated_at" BEFORE UPDATE ON "ai_generations"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- UPDATE: worker mengisi status/output; tanpa DELETE (jejak kuota & audit AI)
GRANT SELECT, INSERT, UPDATE ON "ai_generations" TO app_user;--> statement-breakpoint

ALTER TABLE "kpi_review_summaries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kpi_review_summaries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "kpi_review_summaries"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "kpi_review_summaries_set_updated_at" BEFORE UPDATE ON "kpi_review_summaries"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- Tanpa DELETE: narasi diganti, tidak dihapus
GRANT SELECT, INSERT, UPDATE ON "kpi_review_summaries" TO app_user;
