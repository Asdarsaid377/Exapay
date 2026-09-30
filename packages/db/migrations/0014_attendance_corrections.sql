-- Target FK komposit dari attendance_corrections — harus ada sebelum FK dibuat
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_tenant_id_id_key" UNIQUE("tenant_id","id");--> statement-breakpoint
CREATE TABLE "attendance_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"attendance_record_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"before_check_in_at" timestamp with time zone,
	"before_check_out_at" timestamp with time zone,
	"before_late_minutes" integer,
	"after_check_in_at" timestamp with time zone NOT NULL,
	"after_check_out_at" timestamp with time zone,
	"after_late_minutes" integer NOT NULL,
	"reason" text NOT NULL,
	"corrected_by_user_id" uuid,
	"corrected_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_corrections_reason" CHECK (length("attendance_corrections"."reason") > 0),
	CONSTRAINT "attendance_corrections_before_pair" CHECK ("attendance_corrections"."before_check_in_at" IS NOT NULL OR ("attendance_corrections"."before_check_out_at" IS NULL AND "attendance_corrections"."before_late_minutes" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_corrected_by_user_id_users_id_fk" FOREIGN KEY ("corrected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_record_fk" FOREIGN KEY ("tenant_id","attendance_record_id") REFERENCES "public"."attendance_records"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_corrections_tenant_employee_date_idx" ON "attendance_corrections" USING btree ("tenant_id","employee_id","work_date");--> statement-breakpoint
CREATE INDEX "attendance_corrections_tenant_created_idx" ON "attendance_corrections" USING btree ("tenant_id","created_at");--> statement-breakpoint

-- ---- Tabel tenant biasa. Index diawali tenant_id — melayani filter tenant tanpa index terpisah.
ALTER TABLE "attendance_corrections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_corrections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "attendance_corrections"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "attendance_corrections_set_updated_at" BEFORE UPDATE ON "attendance_corrections"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- Append-only: riwayat koreksi tidak bisa diubah/dihapus dari aplikasi
GRANT SELECT, INSERT ON "attendance_corrections" TO app_user;
