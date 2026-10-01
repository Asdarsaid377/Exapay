ALTER TABLE "payroll_runs" DROP CONSTRAINT "payroll_runs_final";--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "period_start" date;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "period_end" date;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "attendance_cutoff_day" smallint;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_period_range" CHECK ("payroll_runs"."period_end" IS NULL OR "payroll_runs"."period_end" >= "payroll_runs"."period_start");--> statement-breakpoint

-- ---- Periode final sebelum feature 30b = bulan kalender (tanpa tutup buku). Baris final dikunci trigger & RLS FORCE:
-- isi sekali di migration (NO FORCE + trigger dimatikan sementara, dalam transaksi migration yang sama).
ALTER TABLE "payroll_runs" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payroll_runs" DISABLE TRIGGER "payroll_runs_guard_final";--> statement-breakpoint
UPDATE "payroll_runs"
  SET "period_start" = "period_month", "period_end" = ("period_month" + interval '1 month' - interval '1 day')::date
  WHERE "status" = 'final';--> statement-breakpoint
ALTER TABLE "payroll_runs" ENABLE TRIGGER "payroll_runs_guard_final";--> statement-breakpoint
ALTER TABLE "payroll_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_final" CHECK (("payroll_runs"."status" = 'final') = ("payroll_runs"."finalized_at" IS NOT NULL AND "payroll_runs"."snapshot" IS NOT NULL AND "payroll_runs"."period_start" IS NOT NULL AND "payroll_runs"."period_end" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_attendance_cutoff_day" CHECK ("tenants"."attendance_cutoff_day" BETWEEN 1 AND 28);--> statement-breakpoint

-- Rentang periode diisi saat finalisasi (status final di UPDATE yang sama) lalu ikut terkunci
GRANT UPDATE ("period_start", "period_end") ON "payroll_runs" TO app_user;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.payroll_runs_guard_final() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (NEW.id, NEW.tenant_id, NEW.period_month, NEW.status, NEW.created_by_name, NEW.finalized_at, NEW.finalized_by_name, NEW.snapshot, NEW.period_start, NEW.period_end)
      IS NOT DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.period_month, OLD.status, OLD.created_by_name, OLD.finalized_at, OLD.finalized_by_name, OLD.snapshot, OLD.period_start, OLD.period_end)
    AND (NEW.created_by_user_id IS NOT DISTINCT FROM OLD.created_by_user_id OR NEW.created_by_user_id IS NULL)
    AND (NEW.finalized_by_user_id IS NOT DISTINCT FROM OLD.finalized_by_user_id OR NEW.finalized_by_user_id IS NULL)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'payroll final terkunci' USING ERRCODE = 'insufficient_privilege';
END $$;
