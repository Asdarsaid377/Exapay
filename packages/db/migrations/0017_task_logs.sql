CREATE TYPE "public"."task_log_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "task_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"indicator_id" uuid,
	"quantity" numeric(18, 2),
	"note" text,
	"photo_key" text,
	"photo_type" text,
	"photo_size" integer,
	"status" "task_log_status" DEFAULT 'pending' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_logs_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "task_logs_kind" CHECK (("task_logs"."indicator_id" IS NULL) = ("task_logs"."quantity" IS NULL) AND ("task_logs"."indicator_id" IS NOT NULL OR "task_logs"."note" IS NOT NULL)),
	CONSTRAINT "task_logs_quantity_positive" CHECK ("task_logs"."quantity" IS NULL OR "task_logs"."quantity" > 0),
	CONSTRAINT "task_logs_note_length" CHECK ("task_logs"."note" IS NULL OR char_length("task_logs"."note") BETWEEN 1 AND 500),
	CONSTRAINT "task_logs_photo" CHECK (("task_logs"."photo_key" IS NULL) = ("task_logs"."photo_type" IS NULL) AND ("task_logs"."photo_key" IS NULL) = ("task_logs"."photo_size" IS NULL) AND coalesce("task_logs"."photo_size" > 0, true))
);
--> statement-breakpoint
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_attendance_fk" FOREIGN KEY ("tenant_id","employee_id","work_date") REFERENCES "public"."attendance_records"("tenant_id","employee_id","work_date") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_indicator_fk" FOREIGN KEY ("tenant_id","indicator_id") REFERENCES "public"."kpi_indicators"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_logs_tenant_employee_date_idx" ON "task_logs" USING btree ("tenant_id","employee_id","work_date");--> statement-breakpoint
CREATE INDEX "task_logs_tenant_indicator_idx" ON "task_logs" USING btree ("tenant_id","indicator_id");--> statement-breakpoint

-- ---- Jenis foto yang diterima (diperiksa dari isi file di API)
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_photo_type" CHECK ("photo_type" IS NULL OR "photo_type" IN ('image/jpeg', 'image/png', 'image/webp'));--> statement-breakpoint

-- ---- Tabel tenant biasa. Index (tenant_id, employee_id, work_date) melayani filter tenant.
-- FK (tenant_id, employee_id, work_date) → attendance_records memakai unique index attendance_records_tenant_employee_date_key:
-- log hanya bisa dibuat di tanggal yang sudah absen masuk (absensi tanpa DELETE, jadi tidak pernah yatim).
-- Aturan jenis indikator (numeric/count dari template jabatan saat ini, count bilangan bulat) & jendela 7 hari dicek di API.
ALTER TABLE "task_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_logs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "task_logs"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "task_logs_set_updated_at" BEFORE UPDATE ON "task_logs"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- DELETE: karyawan menghapus catatan yang masih menunggu verifikasi (dicek service)
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_logs" TO app_user;
