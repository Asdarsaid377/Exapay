CREATE TYPE "public"."absence_deduction_mode" AS ENUM('none', 'prorate', 'fixed_per_day');--> statement-breakpoint
CREATE TYPE "public"."attendance_allowance_mode" AS ENUM('none', 'forfeit', 'reduce_per_day');--> statement-breakpoint
CREATE TYPE "public"."late_deduction_mode" AS ENUM('none', 'per_occurrence', 'per_block');--> statement-breakpoint
CREATE TYPE "public"."permit_sick_deduction_mode" AS ENUM('none', 'without_document', 'after_days');--> statement-breakpoint
CREATE TYPE "public"."prorate_base" AS ENUM('base_salary', 'base_and_fixed_allowances');--> statement-breakpoint
CREATE TYPE "public"."working_day_divisor_mode" AS ENUM('actual', 'fixed');--> statement-breakpoint
CREATE TABLE "attendance_deduction_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"absence_mode" "absence_deduction_mode" NOT NULL,
	"absence_prorate_base" "prorate_base",
	"absence_divisor_mode" "working_day_divisor_mode",
	"absence_divisor_days" smallint,
	"absence_amount_per_day" numeric(18, 2),
	"late_mode" "late_deduction_mode" NOT NULL,
	"late_tolerance_minutes" smallint,
	"late_block_minutes" smallint,
	"late_amount" numeric(18, 2),
	"late_monthly_cap" numeric(18, 2),
	"permit_sick_mode" "permit_sick_deduction_mode" NOT NULL,
	"permit_sick_free_days" smallint,
	"allowance_mode" "attendance_allowance_mode" NOT NULL,
	"allowance_min_absent_days" smallint,
	"allowance_amount_per_day" numeric(18, 2),
	"created_by_user_id" uuid,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_deduction_rules_date_order" CHECK ("attendance_deduction_rules"."effective_to" IS NULL OR "attendance_deduction_rules"."effective_to" >= "attendance_deduction_rules"."effective_from"),
	CONSTRAINT "attendance_deduction_rules_absence" CHECK (CASE "attendance_deduction_rules"."absence_mode"
        WHEN 'none' THEN "attendance_deduction_rules"."absence_prorate_base" IS NULL AND "attendance_deduction_rules"."absence_divisor_mode" IS NULL AND "attendance_deduction_rules"."absence_divisor_days" IS NULL AND "attendance_deduction_rules"."absence_amount_per_day" IS NULL
        WHEN 'prorate' THEN "attendance_deduction_rules"."absence_prorate_base" IS NOT NULL AND "attendance_deduction_rules"."absence_divisor_mode" IS NOT NULL AND "attendance_deduction_rules"."absence_amount_per_day" IS NULL
          AND ("attendance_deduction_rules"."absence_divisor_mode" = 'fixed') = ("attendance_deduction_rules"."absence_divisor_days" IS NOT NULL) AND coalesce("attendance_deduction_rules"."absence_divisor_days" BETWEEN 1 AND 31, true)
        WHEN 'fixed_per_day' THEN "attendance_deduction_rules"."absence_prorate_base" IS NULL AND "attendance_deduction_rules"."absence_divisor_mode" IS NULL AND "attendance_deduction_rules"."absence_divisor_days" IS NULL AND "attendance_deduction_rules"."absence_amount_per_day" > 0
      END),
	CONSTRAINT "attendance_deduction_rules_late" CHECK (CASE "attendance_deduction_rules"."late_mode"
        WHEN 'none' THEN "attendance_deduction_rules"."late_tolerance_minutes" IS NULL AND "attendance_deduction_rules"."late_block_minutes" IS NULL AND "attendance_deduction_rules"."late_amount" IS NULL AND "attendance_deduction_rules"."late_monthly_cap" IS NULL
        ELSE "attendance_deduction_rules"."late_tolerance_minutes" BETWEEN 0 AND 240 AND "attendance_deduction_rules"."late_amount" > 0 AND coalesce("attendance_deduction_rules"."late_monthly_cap" > 0, true)
          AND ("attendance_deduction_rules"."late_mode" = 'per_block') = ("attendance_deduction_rules"."late_block_minutes" IS NOT NULL) AND coalesce("attendance_deduction_rules"."late_block_minutes" BETWEEN 1 AND 240, true)
      END),
	CONSTRAINT "attendance_deduction_rules_permit_sick" CHECK (("attendance_deduction_rules"."permit_sick_mode" = 'after_days') = ("attendance_deduction_rules"."permit_sick_free_days" IS NOT NULL) AND coalesce("attendance_deduction_rules"."permit_sick_free_days" BETWEEN 0 AND 31, true)
        AND ("attendance_deduction_rules"."permit_sick_mode" = 'none' OR "attendance_deduction_rules"."absence_mode" <> 'none')),
	CONSTRAINT "attendance_deduction_rules_allowance" CHECK (("attendance_deduction_rules"."allowance_mode" = 'forfeit') = ("attendance_deduction_rules"."allowance_min_absent_days" IS NOT NULL) AND coalesce("attendance_deduction_rules"."allowance_min_absent_days" BETWEEN 1 AND 31, true)
        AND ("attendance_deduction_rules"."allowance_mode" = 'reduce_per_day') = ("attendance_deduction_rules"."allowance_amount_per_day" IS NOT NULL) AND coalesce("attendance_deduction_rules"."allowance_amount_per_day" > 0, true))
);
--> statement-breakpoint
ALTER TABLE "attendance_deduction_rules" ADD CONSTRAINT "attendance_deduction_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_deduction_rules" ADD CONSTRAINT "attendance_deduction_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_deduction_rules_tenant_from_idx" ON "attendance_deduction_rules" USING btree ("tenant_id","effective_from");--> statement-breakpoint

-- ---- Versi aturan satu usaha tidak boleh beririsan (rentang inklusif; effective_to null = tanpa batas atas).
-- btree_gist sudah dibuat di 0013.
ALTER TABLE "attendance_deduction_rules" ADD CONSTRAINT "attendance_deduction_rules_no_overlap" EXCLUDE USING gist (
  "tenant_id" WITH =,
  daterange("effective_from", "effective_to", '[]') WITH &&
);--> statement-breakpoint

-- ---- Tabel tenant biasa. Index (tenant_id, effective_from) melayani filter tenant.
ALTER TABLE "attendance_deduction_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_deduction_rules" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "attendance_deduction_rules"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "attendance_deduction_rules_set_updated_at" BEFORE UPDATE ON "attendance_deduction_rules"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- Isi aturan tidak bisa diubah: UPDATE hanya kolom effective_to (menutup versi). DELETE untuk versi terjadwal yang
-- tertimpa versi baru — service hanya menghapus versi dengan effective_from ≥ tanggal berlaku baru (≥ hari ini).
GRANT SELECT, INSERT, DELETE ON "attendance_deduction_rules" TO app_user;--> statement-breakpoint
GRANT UPDATE ("effective_to") ON "attendance_deduction_rules" TO app_user;
