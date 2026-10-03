-- Feature 48 Panduan Setup Awal: keputusan pengguna per usaha (dilewati, jadwal sudah dicek, kartu selesai ditutup).
-- Langkah selesai dihitung dari data oleh API — tabel ini tidak menyimpan centang langkah.
CREATE TABLE "setup_guide_states" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"hidden_at" timestamp with time zone,
	"schedule_checked_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "setup_guide_states" ADD CONSTRAINT "setup_guide_states_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setup_guide_states" ADD CONSTRAINT "setup_guide_states_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
-- ---- Usaha yang sudah berjalan (pernah membuka periode gaji) tidak melihat panduan: kartu dianggap sudah ditutup.
-- payroll_runs FORCE RLS → dilepas sementara agar app_owner (pemilik tabel) bisa membaca semua usaha di migration ini.
ALTER TABLE "payroll_runs" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO "setup_guide_states" ("tenant_id", "closed_at")
  SELECT DISTINCT "tenant_id", now() FROM "payroll_runs";--> statement-breakpoint
ALTER TABLE "payroll_runs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- ---- Tabel tenant biasa: PK = tenant_id (melayani filter tenant).
ALTER TABLE "setup_guide_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "setup_guide_states" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "setup_guide_states"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "setup_guide_states_set_updated_at" BEFORE UPDATE ON "setup_guide_states"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "setup_guide_states" TO app_user;
