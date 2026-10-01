CREATE TYPE "public"."compliance_deadline_kind" AS ENUM('bpjs_kesehatan', 'bpjs_ketenagakerjaan', 'pph21_payment', 'pph21_report');--> statement-breakpoint
CREATE TYPE "public"."compliance_reminder_kind" AS ENUM('bpjs_kesehatan', 'bpjs_ketenagakerjaan', 'pph21_payment', 'pph21_report', 'contract_end', 'probation_end');--> statement-breakpoint
CREATE TABLE "compliance_deadlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "compliance_deadline_kind" NOT NULL,
	"due_day" smallint NOT NULL,
	"month_offset" smallint NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source" text NOT NULL,
	CONSTRAINT "compliance_deadlines_date_order" CHECK ("compliance_deadlines"."effective_to" IS NULL OR "compliance_deadlines"."effective_to" >= "compliance_deadlines"."effective_from"),
	CONSTRAINT "compliance_deadlines_values" CHECK ("compliance_deadlines"."due_day" BETWEEN 1 AND 31 AND "compliance_deadlines"."month_offset" BETWEEN 0 AND 2)
);
--> statement-breakpoint
CREATE TABLE "compliance_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" "compliance_reminder_kind" NOT NULL,
	"due_date" date NOT NULL,
	"done_at" timestamp with time zone,
	"done_by_user_id" uuid,
	"done_by_name" text,
	"notified_h7_at" timestamp with time zone,
	"notified_h1_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_reminders_tenant_key" UNIQUE("tenant_id","key"),
	CONSTRAINT "compliance_reminders_done" CHECK (("compliance_reminders"."done_at" IS NULL) = ("compliance_reminders"."done_by_name" IS NULL)),
	CONSTRAINT "compliance_reminders_key_kind" CHECK (split_part("compliance_reminders"."key", ':', 1) = "compliance_reminders"."kind"::text)
);
--> statement-breakpoint
ALTER TABLE "compliance_reminders" ADD CONSTRAINT "compliance_reminders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_reminders" ADD CONSTRAINT "compliance_reminders_done_by_user_id_users_id_fk" FOREIGN KEY ("done_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compliance_reminders_tenant_due_idx" ON "compliance_reminders" USING btree ("tenant_id","due_date");--> statement-breakpoint

-- ---- compliance_deadlines: data regulasi platform (pola 0021) — app_user SELECT saja, isi lewat migration.
ALTER TABLE "compliance_deadlines" ADD CONSTRAINT "compliance_deadlines_no_overlap" EXCLUDE USING gist (
  "kind" WITH =,
  daterange("effective_from", "effective_to", '[]') WITH &&
);--> statement-breakpoint
ALTER TABLE "compliance_deadlines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reference_read" ON "compliance_deadlines" FOR SELECT USING (true);--> statement-breakpoint
GRANT SELECT ON "compliance_deadlines" TO app_user;--> statement-breakpoint

-- Seed tenggat (feature 33), diverifikasi 2026-10-01. effective_from/to = MASA pajak/iuran. Cakupan mulai 2024-01-01
-- (sama dengan data regulasi 0022). Bila tenggat jatuh pada hari libur, aturan menggeser ke hari kerja berikutnya —
-- pengingat tetap memakai tanggal nominal (lebih awal = aman).
INSERT INTO "compliance_deadlines" ("kind", "due_day", "month_offset", "effective_from", "effective_to", "source") VALUES
  ('bpjs_kesehatan', 10, 0, '2024-01-01', NULL, 'Perpres 82/2018 Pasal 39 ayat (1): pemberi kerja menyetor iuran BPJS Kesehatan paling lambat tanggal 10 setiap bulan (bulan iuran berjalan); ayat (4): hari libur → hari kerja berikutnya'),
  ('bpjs_ketenagakerjaan', 15, 1, '2024-01-01', NULL, 'PP 44/2015 (JKK, JKM) & PP 46/2015 (JHT), juga PP 45/2015 (JP): iuran dibayar paling lambat tanggal 15 bulan berikutnya dari bulan iuran; hari libur → hari kerja berikutnya'),
  ('pph21_payment', 10, 1, '2024-01-01', '2024-12-31', 'PMK 242/PMK.03/2014 Pasal 2 ayat (6): PPh Pasal 21 disetor paling lama tanggal 10 bulan berikutnya setelah masa pajak berakhir'),
  ('pph21_payment', 15, 1, '2025-01-01', NULL, 'PMK 81/2024 Pasal 94: PPh Pasal 21 disetor paling lambat tanggal 15 bulan berikutnya setelah masa pajak berakhir (berlaku 1 Jan 2025); hari libur → hari kerja berikutnya. Dicek: Kring Pajak (X) & ortax.org'),
  ('pph21_report', 20, 1, '2024-01-01', '2024-12-31', 'PMK 243/PMK.03/2014 jo. PMK 9/PMK.03/2018: SPT Masa PPh Pasal 21 dilaporkan paling lama 20 hari setelah masa pajak berakhir'),
  ('pph21_report', 20, 1, '2025-01-01', NULL, 'PMK 81/2024: SPT Masa PPh Pasal 21/26 dilaporkan paling lambat tanggal 20 bulan berikutnya setelah masa pajak berakhir (berlaku 1 Jan 2025). Dicek: Kring Pajak (X) & online-pajak.com');--> statement-breakpoint
-- FORCE setelah seed: policy hanya SELECT, FORCE juga berlaku untuk app_owner
ALTER TABLE "compliance_deadlines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- ---- compliance_reminders: status per usaha. Baris dibuat saat ditandai selesai (API) atau email terkirim (worker).
-- Identitas baris (tenant, key, jenis, tanggal) tidak pernah berubah → app_user UPDATE hanya kolom status/email.
ALTER TABLE "compliance_reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "compliance_reminders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "compliance_reminders"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "compliance_reminders_set_updated_at" BEFORE UPDATE ON "compliance_reminders"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT ON "compliance_reminders" TO app_user;--> statement-breakpoint
GRANT UPDATE ("done_at", "done_by_user_id", "done_by_name", "notified_h7_at", "notified_h1_at") ON "compliance_reminders" TO app_user;--> statement-breakpoint

-- ---- Job harian kalender kepatuhan (apps/worker) perlu daftar usaha aktif LINTAS tenant untuk membuat satu job per usaha.
-- Operasi lintas tenant yang terdokumentasi (database-standards "Dua Role Postgres"): SECURITY DEFINER milik app_owner,
-- membaca tenants lewat policy definer_select (0005). Hanya mengembalikan id — data usaha dibaca job per tenant di bawah RLS.
CREATE FUNCTION public.compliance_active_tenant_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT t.id FROM public.tenants t WHERE t.deactivated_at IS NULL ORDER BY t.id $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.compliance_active_tenant_ids() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.compliance_active_tenant_ids() TO app_user;
