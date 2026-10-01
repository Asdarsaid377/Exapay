CREATE TABLE "payroll_run_employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"status" text NOT NULL,
	"full_name" text NOT NULL,
	"employee_number" text,
	"gross_pay" numeric(18, 2),
	"total_deductions" numeric(18, 2),
	"bpjs_employer" numeric(18, 2),
	"bpjs_employee" numeric(18, 2),
	"pph21" numeric(18, 2),
	"take_home_pay" numeric(18, 2),
	"pph21_gross_income" numeric(18, 2),
	"pension_contribution" numeric(18, 2),
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_run_employees_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "payroll_run_employees_run_employee_key" UNIQUE("tenant_id","run_id","employee_id"),
	CONSTRAINT "payroll_run_employees_status" CHECK ("payroll_run_employees"."status" IN ('calculated', 'excluded')),
	CONSTRAINT "payroll_run_employees_amounts" CHECK (("payroll_run_employees"."status" = 'calculated') = ("payroll_run_employees"."gross_pay" IS NOT NULL AND "payroll_run_employees"."total_deductions" IS NOT NULL AND "payroll_run_employees"."bpjs_employer" IS NOT NULL
        AND "payroll_run_employees"."bpjs_employee" IS NOT NULL AND "payroll_run_employees"."pph21" IS NOT NULL AND "payroll_run_employees"."take_home_pay" IS NOT NULL
        AND "payroll_run_employees"."pph21_gross_income" IS NOT NULL AND "payroll_run_employees"."pension_contribution" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "finalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "finalized_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "finalized_by_name" text;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "payroll_run_employees" ADD CONSTRAINT "payroll_run_employees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_employees" ADD CONSTRAINT "payroll_run_employees_run_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."payroll_runs"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_employees" ADD CONSTRAINT "payroll_run_employees_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payroll_run_employees_tenant_employee_idx" ON "payroll_run_employees" USING btree ("tenant_id","employee_id");--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_finalized_by_user_id_users_id_fk" FOREIGN KEY ("finalized_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_final" CHECK (("payroll_runs"."status" = 'final') = ("payroll_runs"."finalized_at" IS NOT NULL AND "payroll_runs"."snapshot" IS NOT NULL));--> statement-breakpoint

-- ---- payroll_runs: finalisasi (feature 30) mengisi status final + kolom finalisasi + snapshot periode sekali saja.
-- Baris final terkunci; satu-satunya perubahan yang diizinkan = FK akun (created_by/finalized_by) dikosongkan saat akun
-- dihapus (ON DELETE SET NULL) — nama ter-snapshot tetap.
CREATE FUNCTION public.payroll_runs_guard_final() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (NEW.id, NEW.tenant_id, NEW.period_month, NEW.status, NEW.created_by_name, NEW.finalized_at, NEW.finalized_by_name, NEW.snapshot)
      IS NOT DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.period_month, OLD.status, OLD.created_by_name, OLD.finalized_at, OLD.finalized_by_name, OLD.snapshot)
    AND (NEW.created_by_user_id IS NOT DISTINCT FROM OLD.created_by_user_id OR NEW.created_by_user_id IS NULL)
    AND (NEW.finalized_by_user_id IS NOT DISTINCT FROM OLD.finalized_by_user_id OR NEW.finalized_by_user_id IS NULL)
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'payroll final terkunci' USING ERRCODE = 'insufficient_privilege';
END $$;--> statement-breakpoint
CREATE TRIGGER "payroll_runs_guard_final" BEFORE UPDATE OR DELETE ON "payroll_runs"
  FOR EACH ROW WHEN (OLD.status = 'final') EXECUTE FUNCTION public.payroll_runs_guard_final();--> statement-breakpoint
GRANT UPDATE ("status", "finalized_at", "finalized_by_user_id", "finalized_by_name", "snapshot") ON "payroll_runs" TO app_user;--> statement-breakpoint

-- ---- payroll_adjustments: penyesuaian periode final tidak bisa ditambah/diubah/dihapus (service juga menolak 409 &
-- mengunci periode FOR SHARE). Dibaca sebagai invoker → RLS tenant berlaku.
CREATE FUNCTION public.payroll_adjustments_guard_final() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  target record;
BEGIN
  target := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF EXISTS (SELECT 1 FROM public.payroll_runs r WHERE r.tenant_id = target.tenant_id AND r.id = target.run_id AND r.status = 'final')
    OR (TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.payroll_runs r WHERE r.tenant_id = OLD.tenant_id AND r.id = OLD.run_id AND r.status = 'final'))
  THEN
    RAISE EXCEPTION 'penyesuaian payroll final terkunci' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN target;
END $$;--> statement-breakpoint
CREATE TRIGGER "payroll_adjustments_guard_final" BEFORE INSERT OR UPDATE OR DELETE ON "payroll_adjustments"
  FOR EACH ROW EXECUTE FUNCTION public.payroll_adjustments_guard_final();--> statement-breakpoint

-- ---- payroll_run_employees: snapshot final per karyawan — immutable. INSERT hanya selama periode masih draf (finalisasi
-- menulis baris lalu menandai periode final di transaksi yang sama); UPDATE/DELETE selalu ditolak.
CREATE FUNCTION public.payroll_run_employees_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.payroll_runs r WHERE r.tenant_id = NEW.tenant_id AND r.id = NEW.run_id AND r.status = 'final') THEN
      RAISE EXCEPTION 'payroll final terkunci' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'snapshot payroll final tidak bisa diubah' USING ERRCODE = 'insufficient_privilege';
END $$;--> statement-breakpoint
CREATE TRIGGER "payroll_run_employees_guard" BEFORE INSERT OR UPDATE OR DELETE ON "payroll_run_employees"
  FOR EACH ROW EXECUTE FUNCTION public.payroll_run_employees_guard();--> statement-breakpoint
ALTER TABLE "payroll_run_employees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payroll_run_employees" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payroll_run_employees"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "payroll_run_employees_set_updated_at" BEFORE UPDATE ON "payroll_run_employees"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT ON "payroll_run_employees" TO app_user;
