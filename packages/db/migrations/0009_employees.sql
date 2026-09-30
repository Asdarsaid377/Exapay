-- Target FK komposit (tenant_id, id) — harus ada sebelum FK employees dibuat
ALTER TABLE "departments" ADD CONSTRAINT "departments_tenant_id_id_key" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_tenant_id_id_key" UNIQUE("tenant_id","id");--> statement-breakpoint
CREATE TYPE "public"."employee_gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."employment_status" AS ENUM('permanent', 'contract', 'probation');--> statement-breakpoint
CREATE TYPE "public"."ptkp_status" AS ENUM('TK/0', 'TK/1', 'TK/2', 'TK/3', 'K/0', 'K/1', 'K/2', 'K/3');--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_number" text,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"birth_date" date,
	"gender" "employee_gender",
	"department_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"supervisor_id" uuid,
	"user_id" uuid,
	"join_date" date NOT NULL,
	"employment_status" "employment_status" NOT NULL,
	"contract_end_date" date,
	"probation_end_date" date,
	"nik_encrypted" text,
	"nik_hash" text,
	"npwp_encrypted" text,
	"ptkp_status" "ptkp_status" NOT NULL,
	"bank_code" text,
	"bank_account_encrypted" text,
	"bank_account_holder" text,
	"end_date" date,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "employees_not_own_supervisor" CHECK ("employees"."supervisor_id" IS NULL OR "employees"."supervisor_id" <> "employees"."id"),
	CONSTRAINT "employees_contract_end_date" CHECK (("employees"."employment_status" = 'contract') = ("employees"."contract_end_date" IS NOT NULL) AND ("employees"."contract_end_date" IS NULL OR "employees"."contract_end_date" >= "employees"."join_date")),
	CONSTRAINT "employees_probation_end_date" CHECK (("employees"."employment_status" = 'probation') = ("employees"."probation_end_date" IS NOT NULL) AND ("employees"."probation_end_date" IS NULL OR "employees"."probation_end_date" >= "employees"."join_date")),
	CONSTRAINT "employees_end_date" CHECK ("employees"."end_date" IS NULL OR "employees"."end_date" >= "employees"."join_date"),
	CONSTRAINT "employees_nik_hash_pair" CHECK (("employees"."nik_encrypted" IS NULL) = ("employees"."nik_hash" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_fk" FOREIGN KEY ("tenant_id","department_id") REFERENCES "public"."departments"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_fk" FOREIGN KEY ("tenant_id","position_id") REFERENCES "public"."positions"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_supervisor_fk" FOREIGN KEY ("tenant_id","supervisor_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_membership_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."memberships"("tenant_id","user_id") ON DELETE SET NULL ("user_id") ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_tenant_number_key" ON "employees" USING btree ("tenant_id",lower("employee_number")) WHERE "employees"."employee_number" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_tenant_nik_hash_key" ON "employees" USING btree ("tenant_id","nik_hash") WHERE "employees"."nik_hash" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_tenant_user_key" ON "employees" USING btree ("tenant_id","user_id") WHERE "employees"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "employees_tenant_supervisor_idx" ON "employees" USING btree ("tenant_id","supervisor_id");--> statement-breakpoint
CREATE INDEX "employees_tenant_department_idx" ON "employees" USING btree ("tenant_id","department_id");--> statement-breakpoint
CREATE INDEX "employees_tenant_position_idx" ON "employees" USING btree ("tenant_id","position_id");--> statement-breakpoint

-- ---- employees: tabel tenant biasa ----
-- Index unik (tenant_id, id) melayani filter tenant_id (kolom pertama) — tanpa index tenant_id terpisah.
-- FK membership: ON DELETE SET NULL ("user_id") (PG 15+) — hanya user_id yang dikosongkan; SET NULL biasa akan
-- mengosongkan tenant_id juga dan melanggar NOT NULL.
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employees" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "employees"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "employees_set_updated_at" BEFORE UPDATE ON "employees"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- Tanpa DELETE: karyawan tidak pernah dihapus (nonaktif = end_date terisi)
GRANT SELECT, INSERT, UPDATE ON "employees" TO app_user;
