CREATE TYPE "public"."payroll_component_kind" AS ENUM('base_salary', 'fixed_allowance', 'variable_allowance', 'attendance_allowance', 'deduction');--> statement-breakpoint
CREATE TABLE "employee_salaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"bpjs_kesehatan" boolean NOT NULL,
	"bpjs_jht" boolean NOT NULL,
	"bpjs_jp" boolean NOT NULL,
	"bpjs_jkk" boolean NOT NULL,
	"bpjs_jkm" boolean NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_salaries_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "employee_salaries_date_order" CHECK ("employee_salaries"."effective_to" IS NULL OR "employee_salaries"."effective_to" >= "employee_salaries"."effective_from"),
	CONSTRAINT "employee_salaries_note" CHECK ("employee_salaries"."note" IS NULL OR length("employee_salaries"."note") <= 500)
);
--> statement-breakpoint
CREATE TABLE "employee_salary_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"salary_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_salary_items_amount" CHECK ("employee_salary_items"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "salary_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "payroll_component_kind" NOT NULL,
	"sort_order" smallint NOT NULL,
	"builtin_key" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_components_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "salary_components_base_not_archived" CHECK ("salary_components"."kind" <> 'base_salary' OR "salary_components"."archived_at" IS NULL),
	CONSTRAINT "salary_components_name" CHECK (length(btrim("salary_components"."name")) BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "jkk_risk_level" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salary_items" ADD CONSTRAINT "employee_salary_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salary_items" ADD CONSTRAINT "employee_salary_items_salary_fk" FOREIGN KEY ("tenant_id","salary_id") REFERENCES "public"."employee_salaries"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salary_items" ADD CONSTRAINT "employee_salary_items_component_fk" FOREIGN KEY ("tenant_id","component_id") REFERENCES "public"."salary_components"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_salaries_tenant_employee_from_idx" ON "employee_salaries" USING btree ("tenant_id","employee_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_salary_items_salary_component_key" ON "employee_salary_items" USING btree ("tenant_id","salary_id","component_id");--> statement-breakpoint
CREATE INDEX "employee_salary_items_tenant_component_idx" ON "employee_salary_items" USING btree ("tenant_id","component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "salary_components_tenant_name_key" ON "salary_components" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "salary_components_tenant_builtin_key" ON "salary_components" USING btree ("tenant_id","builtin_key") WHERE "salary_components"."builtin_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "salary_components_tenant_single_kind_key" ON "salary_components" USING btree ("tenant_id","kind") WHERE "salary_components"."kind" IN ('base_salary', 'attendance_allowance') AND "salary_components"."archived_at" IS NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_jkk_risk_level" CHECK ("tenants"."jkk_risk_level" BETWEEN 1 AND 5);--> statement-breakpoint

-- ---- Versi gaji satu karyawan tidak boleh beririsan (rentang inklusif; effective_to null = tanpa batas atas).
-- btree_gist sudah dibuat di 0013.
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_no_overlap" EXCLUDE USING gist (
  "tenant_id" WITH =,
  "employee_id" WITH =,
  daterange("effective_from", "effective_to", '[]') WITH &&
);--> statement-breakpoint

-- ---- Komponen bawaan untuk usaha yang sudah ada (usaha baru: seedTenantDefaults → seedBuiltinSalaryComponents).
-- Daftar ini = SALARY_BUILTIN_COMPONENTS di apps/api/src/modules/payroll/salary-builtin-components.ts — jaga tetap sama.
-- Diisi sebelum RLS diaktifkan; tenants dibaca app_owner lewat policy definer_select.
INSERT INTO "salary_components" ("tenant_id", "name", "kind", "sort_order", "builtin_key")
SELECT t.id, c.name, c.kind::"payroll_component_kind", c.sort_order, c.builtin_key
FROM "tenants" t
CROSS JOIN (VALUES
  (1, 'base_salary', 'Gaji Pokok', 'base_salary'),
  (2, 'position_allowance', 'Tunjangan Jabatan', 'fixed_allowance'),
  (3, 'meal_allowance', 'Uang Makan', 'variable_allowance'),
  (4, 'transport_allowance', 'Uang Transport', 'variable_allowance'),
  (5, 'attendance_allowance', 'Tunjangan Kehadiran', 'attendance_allowance'),
  (6, 'incentive', 'Insentif', 'variable_allowance'),
  (7, 'thr', 'THR', 'variable_allowance'),
  (8, 'loan_installment', 'Cicilan Pinjaman', 'deduction')
) AS c(sort_order, builtin_key, name, kind);--> statement-breakpoint

-- ---- salary_components: tabel tenant biasa. Index unik (tenant_id, id) melayani filter tenant_id.
ALTER TABLE "salary_components" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "salary_components" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "salary_components"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "salary_components_set_updated_at" BEFORE UPDATE ON "salary_components"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "salary_components" TO app_user;--> statement-breakpoint

-- ---- employee_salaries: isi versi immutable — UPDATE hanya effective_to (menutup versi). DELETE untuk versi yang
-- tergantikan versi baru (effective_from ≥ tanggal berlaku baru, dicek service); item ikut terhapus (CASCADE).
ALTER TABLE "employee_salaries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employee_salaries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "employee_salaries"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "employee_salaries_set_updated_at" BEFORE UPDATE ON "employee_salaries"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "employee_salaries" TO app_user;--> statement-breakpoint
GRANT UPDATE ("effective_to") ON "employee_salaries" TO app_user;--> statement-breakpoint

-- ---- employee_salary_items: ditulis sekali bersama versinya, tidak pernah diubah.
ALTER TABLE "employee_salary_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employee_salary_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "employee_salary_items"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "employee_salary_items_set_updated_at" BEFORE UPDATE ON "employee_salary_items"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "employee_salary_items" TO app_user;

-- tenants.jkk_risk_level: grant UPDATE tenants ke app_user (0000) & policy tenant_isolation sudah mencakup kolom ini
-- (owner/admin dicek API).
