CREATE TYPE "public"."employee_schedule_mode" AS ENUM('business', 'shift');--> statement-breakpoint
CREATE TABLE "shift_roster_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"work_shift_id" uuid,
	"shift_name" text,
	"start_time" time,
	"end_time" time,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_roster_days_entry" CHECK (("shift_roster_days"."shift_name" IS NULL) = ("shift_roster_days"."start_time" IS NULL) AND ("shift_roster_days"."start_time" IS NULL) = ("shift_roster_days"."end_time" IS NULL) AND ("shift_roster_days"."shift_name" IS NOT NULL OR "shift_roster_days"."work_shift_id" IS NULL) AND coalesce("shift_roster_days"."start_time" <> "shift_roster_days"."end_time", true))
);
--> statement-breakpoint
CREATE TABLE "work_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_shifts_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "work_shifts_name" CHECK (length("work_shifts"."name") BETWEEN 1 AND 40),
	CONSTRAINT "work_shifts_times" CHECK ("work_shifts"."start_time" <> "work_shifts"."end_time")
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "schedule_mode" "employee_schedule_mode" DEFAULT 'business' NOT NULL;--> statement-breakpoint
ALTER TABLE "shift_roster_days" ADD CONSTRAINT "shift_roster_days_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_roster_days" ADD CONSTRAINT "shift_roster_days_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_roster_days" ADD CONSTRAINT "shift_roster_days_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_roster_days" ADD CONSTRAINT "shift_roster_days_shift_fk" FOREIGN KEY ("tenant_id","work_shift_id") REFERENCES "public"."work_shifts"("tenant_id","id") ON DELETE SET NULL ("work_shift_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_shifts" ADD CONSTRAINT "work_shifts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shift_roster_days_tenant_employee_date_key" ON "shift_roster_days" USING btree ("tenant_id","employee_id","work_date");--> statement-breakpoint
CREATE INDEX "shift_roster_days_tenant_shift_idx" ON "shift_roster_days" USING btree ("tenant_id","work_shift_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_shifts_tenant_name_key" ON "work_shifts" USING btree ("tenant_id",lower("name"));--> statement-breakpoint

-- ---- Tabel tenant biasa (feature 46). Index/PK/unique diawali tenant_id — melayani filter tenant tanpa index terpisah.
-- FK roster → shift: ON DELETE SET NULL hanya kolom work_shift_id (tenant_id tetap) — snapshot nama/jam tetap terbaca.
ALTER TABLE "work_shifts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_shifts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "work_shifts"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "work_shifts_set_updated_at" BEFORE UPDATE ON "work_shifts"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "work_shifts" TO app_user;--> statement-breakpoint

ALTER TABLE "shift_roster_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shift_roster_days" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "shift_roster_days"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "shift_roster_days_set_updated_at" BEFORE UPDATE ON "shift_roster_days"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- Kosongkan sel = DELETE; riwayat perubahan di audit_logs
GRANT SELECT, INSERT, UPDATE, DELETE ON "shift_roster_days" TO app_user;
