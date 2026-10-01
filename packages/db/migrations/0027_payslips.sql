CREATE TYPE "public"."payslip_email_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payslip_status" AS ENUM('pending', 'generating', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"status" "payslip_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"file_key" text,
	"file_size" integer,
	"generated_at" timestamp with time zone,
	"error" text,
	"published_at" timestamp with time zone,
	"published_by_user_id" uuid,
	"published_by_name" text,
	"email_status" "payslip_email_status",
	"email_to" text,
	"email_requested_at" timestamp with time zone,
	"email_sent_at" timestamp with time zone,
	"email_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payslips_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "payslips_run_employee_key" UNIQUE("tenant_id","run_id","employee_id"),
	CONSTRAINT "payslips_file" CHECK (("payslips"."status" = 'ready') = ("payslips"."file_key" IS NOT NULL AND "payslips"."file_size" IS NOT NULL AND "payslips"."generated_at" IS NOT NULL)),
	CONSTRAINT "payslips_published" CHECK ("payslips"."published_at" IS NULL OR "payslips"."status" = 'ready'),
	CONSTRAINT "payslips_email" CHECK (("payslips"."email_status" IS NULL) = ("payslips"."email_to" IS NULL AND "payslips"."email_requested_at" IS NULL) AND ("payslips"."email_status" IS NULL OR "payslips"."published_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_employee_fk" FOREIGN KEY ("tenant_id","run_id","employee_id") REFERENCES "public"."payroll_run_employees"("tenant_id","run_id","employee_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payslips_tenant_employee_idx" ON "payslips" USING btree ("tenant_id","employee_id");--> statement-breakpoint

-- ---- payslips: slip hanya untuk karyawan yang dihitung di periode final; slip siap tidak bisa diganti, terbit tidak bisa
-- dibatalkan. Identitas baris (tenant/periode/karyawan) tidak pernah berubah. Dibaca sebagai invoker → RLS tenant berlaku.
CREATE FUNCTION public.payslips_guard() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.published_at IS NOT NULL OR NEW.email_status IS NOT NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.payroll_run_employees e
        WHERE e.tenant_id = NEW.tenant_id AND e.run_id = NEW.run_id AND e.employee_id = NEW.employee_id AND e.status = 'calculated'
      )
    THEN
      RAISE EXCEPTION 'slip gaji hanya untuk karyawan yang dihitung di payroll final' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.tenant_id, NEW.run_id, NEW.employee_id) IS DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.run_id, OLD.employee_id)
    OR (OLD.status = 'ready'
      AND (NEW.status, NEW.file_key, NEW.file_size, NEW.generated_at) IS DISTINCT FROM (OLD.status, OLD.file_key, OLD.file_size, OLD.generated_at))
    OR (OLD.published_at IS NOT NULL
      AND (NEW.published_at, NEW.published_by_name) IS DISTINCT FROM (OLD.published_at, OLD.published_by_name))
  THEN
    RAISE EXCEPTION 'slip gaji yang sudah dibuat/terbit tidak bisa diubah' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "payslips_guard" BEFORE INSERT OR UPDATE ON "payslips"
  FOR EACH ROW EXECUTE FUNCTION public.payslips_guard();--> statement-breakpoint
ALTER TABLE "payslips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payslips" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "payslips"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "payslips_set_updated_at" BEFORE UPDATE ON "payslips"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT ON "payslips" TO app_user;--> statement-breakpoint
GRANT UPDATE ("status", "attempts", "file_key", "file_size", "generated_at", "error", "published_at", "published_by_user_id",
  "published_by_name", "email_status", "email_to", "email_requested_at", "email_sent_at", "email_error") ON "payslips" TO app_user;
