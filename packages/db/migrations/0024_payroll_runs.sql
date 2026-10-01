CREATE TYPE "public"."payroll_adjustment_kind" AS ENUM('add_line', 'override_component', 'waive_attendance', 'exclude');--> statement-breakpoint
CREATE TYPE "public"."payroll_run_status" AS ENUM('draft', 'final');--> statement-breakpoint
CREATE TABLE "payroll_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" "payroll_adjustment_kind" NOT NULL,
	"line_kind" "payroll_component_kind",
	"name" text,
	"component_id" uuid,
	"amount" numeric(18, 2),
	"reason" text,
	"created_by_user_id" uuid,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_adjustments_fields" CHECK (CASE "payroll_adjustments"."kind"
        WHEN 'add_line' THEN "payroll_adjustments"."line_kind" IN ('variable_allowance', 'deduction') AND "payroll_adjustments"."name" IS NOT NULL AND "payroll_adjustments"."amount" > 0
          AND "payroll_adjustments"."component_id" IS NULL AND "payroll_adjustments"."reason" IS NULL
        WHEN 'override_component' THEN "payroll_adjustments"."component_id" IS NOT NULL AND "payroll_adjustments"."amount" >= 0 AND "payroll_adjustments"."reason" IS NOT NULL
          AND "payroll_adjustments"."line_kind" IS NULL AND "payroll_adjustments"."name" IS NULL
        ELSE "payroll_adjustments"."reason" IS NOT NULL AND "payroll_adjustments"."line_kind" IS NULL AND "payroll_adjustments"."name" IS NULL AND "payroll_adjustments"."component_id" IS NULL AND "payroll_adjustments"."amount" IS NULL
      END),
	CONSTRAINT "payroll_adjustments_name" CHECK ("payroll_adjustments"."name" IS NULL OR length(btrim("payroll_adjustments"."name")) BETWEEN 1 AND 80),
	CONSTRAINT "payroll_adjustments_reason" CHECK ("payroll_adjustments"."reason" IS NULL OR length(btrim("payroll_adjustments"."reason")) BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"period_month" date NOT NULL,
	"status" "payroll_run_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_runs_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "payroll_runs_tenant_month_key" UNIQUE("tenant_id","period_month"),
	CONSTRAINT "payroll_runs_period_month" CHECK (extract(day from "payroll_runs"."period_month") = 1)
);
--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_run_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."payroll_runs"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_component_fk" FOREIGN KEY ("tenant_id","component_id") REFERENCES "public"."salary_components"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payroll_adjustments_tenant_run_employee_idx" ON "payroll_adjustments" USING btree ("tenant_id","run_id","employee_id");--> statement-breakpoint
CREATE INDEX "payroll_adjustments_tenant_employee_idx" ON "payroll_adjustments" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE INDEX "payroll_adjustments_tenant_component_idx" ON "payroll_adjustments" USING btree ("tenant_id","component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_adjustments_single_key" ON "payroll_adjustments" USING btree ("tenant_id","run_id","employee_id","kind") WHERE "payroll_adjustments"."kind" IN ('waive_attendance', 'exclude');--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_adjustments_override_key" ON "payroll_adjustments" USING btree ("tenant_id","run_id","employee_id","component_id") WHERE "payroll_adjustments"."kind" = 'override_component';--> statement-breakpoint

-- ---- payroll_runs: satu periode per bulan per usaha. Feature 29 hanya membuka periode (draf) — perubahan status &
-- snapshot final menyusul di feature 30 (grant UPDATE ditambah di sana). Tanpa DELETE.
ALTER TABLE "payroll_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payroll_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payroll_runs"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "payroll_runs_set_updated_at" BEFORE UPDATE ON "payroll_runs"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT ON "payroll_runs" TO app_user;--> statement-breakpoint

-- ---- payroll_adjustments: penyesuaian draf — ubah hanya isian (bukan jenis/karyawan/periode), hapus = batalkan.
ALTER TABLE "payroll_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payroll_adjustments"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "payroll_adjustments_set_updated_at" BEFORE UPDATE ON "payroll_adjustments"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "payroll_adjustments" TO app_user;--> statement-breakpoint
GRANT UPDATE ("line_kind", "name", "amount", "reason") ON "payroll_adjustments" TO app_user;
