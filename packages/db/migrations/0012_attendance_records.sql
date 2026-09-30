CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"time_zone" text NOT NULL,
	"scheduled_start" time,
	"scheduled_end" time,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"check_in_at" timestamp with time zone NOT NULL,
	"check_in_latitude" double precision,
	"check_in_longitude" double precision,
	"check_in_accuracy" double precision,
	"check_out_at" timestamp with time zone,
	"check_out_latitude" double precision,
	"check_out_longitude" double precision,
	"check_out_accuracy" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_records_late_minutes" CHECK ("attendance_records"."late_minutes" >= 0),
	CONSTRAINT "attendance_records_schedule_pair" CHECK (("attendance_records"."scheduled_start" IS NULL) = ("attendance_records"."scheduled_end" IS NULL)),
	CONSTRAINT "attendance_records_off_day_not_late" CHECK ("attendance_records"."scheduled_start" IS NOT NULL OR "attendance_records"."late_minutes" = 0),
	CONSTRAINT "attendance_records_check_out_order" CHECK ("attendance_records"."check_out_at" IS NULL OR "attendance_records"."check_out_at" >= "attendance_records"."check_in_at"),
	CONSTRAINT "attendance_records_check_in_location" CHECK (("attendance_records"."check_in_latitude" IS NULL) = ("attendance_records"."check_in_longitude" IS NULL) AND ("attendance_records"."check_in_latitude" IS NOT NULL OR "attendance_records"."check_in_accuracy" IS NULL)),
	CONSTRAINT "attendance_records_check_out_location" CHECK (("attendance_records"."check_out_latitude" IS NULL) = ("attendance_records"."check_out_longitude" IS NULL) AND ("attendance_records"."check_out_latitude" IS NOT NULL OR "attendance_records"."check_out_accuracy" IS NULL)),
	CONSTRAINT "attendance_records_check_out_location_needs_time" CHECK ("attendance_records"."check_out_at" IS NOT NULL OR "attendance_records"."check_out_latitude" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_tenant_employee_date_key" ON "attendance_records" USING btree ("tenant_id","employee_id","work_date");--> statement-breakpoint

-- ---- Tabel tenant biasa. Index unik diawali tenant_id — melayani filter tenant tanpa index terpisah.
ALTER TABLE "attendance_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_records" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "attendance_records"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "attendance_records_set_updated_at" BEFORE UPDATE ON "attendance_records"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- Tanpa DELETE: riwayat absensi dasar potongan payroll; koreksi (feature 16) mengubah baris + audit log
GRANT SELECT, INSERT, UPDATE ON "attendance_records" TO app_user;
