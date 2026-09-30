CREATE TYPE "public"."leave_request_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('permit', 'sick', 'leave');--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" "leave_type" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text NOT NULL,
	"status" "leave_request_status" DEFAULT 'pending' NOT NULL,
	"attachment_key" text,
	"attachment_name" text,
	"attachment_type" text,
	"attachment_size" integer,
	"requested_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"decided_by_name" text,
	"decision_note" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_requests_date_order" CHECK ("leave_requests"."end_date" >= "leave_requests"."start_date"),
	CONSTRAINT "leave_requests_max_range" CHECK ("leave_requests"."end_date" - "leave_requests"."start_date" < 92),
	CONSTRAINT "leave_requests_attachment" CHECK (("leave_requests"."attachment_key" IS NULL) = ("leave_requests"."attachment_name" IS NULL) AND ("leave_requests"."attachment_key" IS NULL) = ("leave_requests"."attachment_type" IS NULL) AND ("leave_requests"."attachment_key" IS NULL) = ("leave_requests"."attachment_size" IS NULL)),
	CONSTRAINT "leave_requests_decision" CHECK (("leave_requests"."status" IN ('approved', 'rejected')) = ("leave_requests"."decided_at" IS NOT NULL) AND ("leave_requests"."decided_at" IS NOT NULL OR ("leave_requests"."decided_by_user_id" IS NULL AND "leave_requests"."decided_by_name" IS NULL AND "leave_requests"."decision_note" IS NULL))),
	CONSTRAINT "leave_requests_cancelled" CHECK (("leave_requests"."status" = 'cancelled') = ("leave_requests"."cancelled_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_requests_tenant_employee_start_idx" ON "leave_requests" USING btree ("tenant_id","employee_id","start_date");--> statement-breakpoint
CREATE INDEX "leave_requests_tenant_status_idx" ON "leave_requests" USING btree ("tenant_id","status","created_at");--> statement-breakpoint

-- ---- Jenis lampiran yang diterima (diperiksa dari isi file di API)
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_attachment_type" CHECK ("attachment_type" IS NULL OR "attachment_type" IN ('application/pdf', 'image/jpeg', 'image/png'));--> statement-breakpoint

-- ---- Pengajuan aktif (menunggu/disetujui) satu karyawan tidak boleh beririsan — juga aman dari dua kiriman bersamaan.
-- btree_gist: operator = untuk uuid di index GiST. Trusted extension (PG 13+) — boleh dibuat owner database (app_owner).
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_no_overlap" EXCLUDE USING gist (
  "tenant_id" WITH =,
  "employee_id" WITH =,
  daterange("start_date", "end_date", '[]') WITH &&
) WHERE ("status" IN ('pending', 'approved'));--> statement-breakpoint

-- ---- Tabel tenant biasa. Index (tenant_id, employee_id, start_date) melayani filter tenant.
ALTER TABLE "leave_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leave_requests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "leave_requests"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "leave_requests_set_updated_at" BEFORE UPDATE ON "leave_requests"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- Tanpa DELETE: pengajuan dibatalkan lewat status; keputusan tercatat di audit log
GRANT SELECT, INSERT, UPDATE ON "leave_requests" TO app_user;
