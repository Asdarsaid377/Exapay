CREATE TYPE "public"."attendance_event" AS ENUM('check_in', 'check_out');--> statement-breakpoint
CREATE TYPE "public"."attendance_geofence_status" AS ENUM('inside', 'outside', 'inaccurate', 'no_location');--> statement-breakpoint
CREATE TYPE "public"."attendance_review_decision" AS ENUM('accepted', 'follow_up');--> statement-breakpoint
CREATE TYPE "public"."employee_location_mode" AS ENUM('all', 'selected', 'exempt');--> statement-breakpoint
CREATE TABLE "attendance_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"attendance_record_id" uuid NOT NULL,
	"event" "attendance_event" NOT NULL,
	"decision" "attendance_review_decision" NOT NULL,
	"note" text,
	"reviewed_by_user_id" uuid,
	"reviewed_by_name" text,
	"reviewed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_reviews_note" CHECK ("attendance_reviews"."note" IS NULL OR length("attendance_reviews"."note") BETWEEN 1 AND 500),
	CONSTRAINT "attendance_reviews_follow_up_note" CHECK ("attendance_reviews"."decision" <> 'follow_up' OR "attendance_reviews"."note" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "employee_work_locations" (
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_location_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_work_locations_pkey" PRIMARY KEY("tenant_id","employee_id","work_location_id")
);
--> statement-breakpoint
CREATE TABLE "work_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"radius_m" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_locations_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "work_locations_name" CHECK (length("work_locations"."name") BETWEEN 1 AND 80),
	CONSTRAINT "work_locations_latitude" CHECK ("work_locations"."latitude" BETWEEN -90 AND 90),
	CONSTRAINT "work_locations_longitude" CHECK ("work_locations"."longitude" BETWEEN -180 AND 180),
	CONSTRAINT "work_locations_radius" CHECK ("work_locations"."radius_m" BETWEEN 25 AND 1000)
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "check_in_geofence" "attendance_geofence_status";--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "check_in_distance_m" integer;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "check_in_location_name" text;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "check_out_geofence" "attendance_geofence_status";--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "check_out_distance_m" integer;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "check_out_location_name" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "location_mode" "employee_location_mode" DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_reviews" ADD CONSTRAINT "attendance_reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_reviews" ADD CONSTRAINT "attendance_reviews_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_reviews" ADD CONSTRAINT "attendance_reviews_record_fk" FOREIGN KEY ("tenant_id","attendance_record_id") REFERENCES "public"."attendance_records"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_work_locations" ADD CONSTRAINT "employee_work_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_work_locations" ADD CONSTRAINT "employee_work_locations_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_work_locations" ADD CONSTRAINT "employee_work_locations_location_fk" FOREIGN KEY ("tenant_id","work_location_id") REFERENCES "public"."work_locations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_locations" ADD CONSTRAINT "work_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_reviews_tenant_record_event_key" ON "attendance_reviews" USING btree ("tenant_id","attendance_record_id","event");--> statement-breakpoint
CREATE INDEX "employee_work_locations_tenant_location_idx" ON "employee_work_locations" USING btree ("tenant_id","work_location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_locations_tenant_name_key" ON "work_locations" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE INDEX "attendance_records_tenant_flagged_idx" ON "attendance_records" USING btree ("tenant_id","work_date") WHERE "attendance_records"."check_in_geofence" IN ('outside', 'inaccurate', 'no_location') OR "attendance_records"."check_out_geofence" IN ('outside', 'inaccurate', 'no_location');--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_check_in_geofence" CHECK (CASE WHEN "attendance_records"."check_in_geofence" IS NULL OR "attendance_records"."check_in_geofence" = 'no_location' THEN "attendance_records"."check_in_distance_m" IS NULL AND "attendance_records"."check_in_location_name" IS NULL ELSE "attendance_records"."check_in_distance_m" IS NOT NULL AND "attendance_records"."check_in_distance_m" >= 0 AND "attendance_records"."check_in_location_name" IS NOT NULL END);--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_check_out_geofence" CHECK (CASE WHEN "attendance_records"."check_out_geofence" IS NULL OR "attendance_records"."check_out_geofence" = 'no_location' THEN "attendance_records"."check_out_distance_m" IS NULL AND "attendance_records"."check_out_location_name" IS NULL ELSE "attendance_records"."check_out_distance_m" IS NOT NULL AND "attendance_records"."check_out_distance_m" >= 0 AND "attendance_records"."check_out_location_name" IS NOT NULL END);--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_check_out_geofence_needs_time" CHECK ("attendance_records"."check_out_at" IS NOT NULL OR "attendance_records"."check_out_geofence" IS NULL);--> statement-breakpoint

-- ---- Tabel tenant biasa (feature 44). Index/PK/unique diawali tenant_id — melayani filter tenant tanpa index terpisah.
ALTER TABLE "work_locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_locations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "work_locations"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "work_locations_set_updated_at" BEFORE UPDATE ON "work_locations"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "work_locations" TO app_user;--> statement-breakpoint

ALTER TABLE "employee_work_locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employee_work_locations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "employee_work_locations"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "employee_work_locations_set_updated_at" BEFORE UPDATE ON "employee_work_locations"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- Pilihan lokasi diganti utuh (hapus + sisip), tanpa UPDATE
GRANT SELECT, INSERT, DELETE ON "employee_work_locations" TO app_user;--> statement-breakpoint

ALTER TABLE "attendance_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_reviews" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "attendance_reviews"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "attendance_reviews_set_updated_at" BEFORE UPDATE ON "attendance_reviews"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- Keputusan boleh diubah (UPDATE); tidak dihapus. Riwayat perubahan di audit_logs
GRANT SELECT, INSERT, UPDATE ON "attendance_reviews" TO app_user;
