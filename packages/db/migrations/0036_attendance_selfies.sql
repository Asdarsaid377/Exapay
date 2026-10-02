ALTER TABLE "attendance_records" ADD COLUMN "check_in_selfie_key" text;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "check_in_selfie_type" text;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "check_out_selfie_key" text;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "check_out_selfie_type" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "selfie_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "attendance_records_selfie_retention_idx" ON "attendance_records" USING btree ("work_date","tenant_id") WHERE "attendance_records"."check_in_selfie_key" IS NOT NULL OR "attendance_records"."check_out_selfie_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_check_in_selfie" CHECK (("attendance_records"."check_in_selfie_key" IS NULL OR "attendance_records"."check_in_selfie_type" IS NOT NULL) AND coalesce("attendance_records"."check_in_selfie_type" IN ('image/jpeg', 'image/png', 'image/webp'), true));--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_check_out_selfie" CHECK (("attendance_records"."check_out_selfie_key" IS NULL OR "attendance_records"."check_out_selfie_type" IS NOT NULL) AND coalesce("attendance_records"."check_out_selfie_type" IN ('image/jpeg', 'image/png', 'image/webp'), true));--> statement-breakpoint

-- ---- Penghapusan selfie > 90 hari (apps/worker) perlu daftar usaha yang punya selfie kedaluwarsa LINTAS tenant.
-- Operasi lintas tenant terdokumentasi (database-standards "Dua Role Postgres"): SECURITY DEFINER milik app_owner, membaca
-- attendance_records lewat policy definer_select (pola sama dengan tenants, 0005). Hanya mengembalikan id usaha —
-- baris & file dihapus job per tenant di bawah RLS. Cutoff (tanggal kerja) dihitung worker dari SELFIE_RETENTION_DAYS.
CREATE POLICY "definer_select" ON "attendance_records" FOR SELECT
  USING (current_user = 'app_owner');--> statement-breakpoint
CREATE FUNCTION public.attendance_selfie_expired_tenant_ids(cutoff date) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT DISTINCT r.tenant_id FROM public.attendance_records r
    WHERE r.work_date < cutoff AND (r.check_in_selfie_key IS NOT NULL OR r.check_out_selfie_key IS NOT NULL)
    ORDER BY r.tenant_id
  $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.attendance_selfie_expired_tenant_ids(date) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.attendance_selfie_expired_tenant_ids(date) TO app_user;
