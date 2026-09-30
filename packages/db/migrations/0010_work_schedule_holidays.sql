CREATE TYPE "public"."national_holiday_kind" AS ENUM('libur_nasional', 'cuti_bersama');--> statement-breakpoint
CREATE TABLE "company_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "national_holiday_exclusions" (
	"tenant_id" uuid NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "national_holiday_exclusions_pkey" PRIMARY KEY("tenant_id","date")
);
--> statement-breakpoint
CREATE TABLE "national_holidays" (
	"date" date PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "national_holiday_kind" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_schedule_days" (
	"tenant_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"is_workday" boolean NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_schedule_days_pkey" PRIMARY KEY("tenant_id","weekday"),
	CONSTRAINT "work_schedule_days_weekday_range" CHECK ("work_schedule_days"."weekday" between 1 and 7),
	CONSTRAINT "work_schedule_days_time_order" CHECK ("work_schedule_days"."start_time" < "work_schedule_days"."end_time")
);
--> statement-breakpoint
ALTER TABLE "company_holidays" ADD CONSTRAINT "company_holidays_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "national_holiday_exclusions" ADD CONSTRAINT "national_holiday_exclusions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "national_holiday_exclusions" ADD CONSTRAINT "national_holiday_exclusions_date_national_holidays_date_fk" FOREIGN KEY ("date") REFERENCES "public"."national_holidays"("date") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_schedule_days" ADD CONSTRAINT "work_schedule_days_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_holidays_tenant_date_key" ON "company_holidays" USING btree ("tenant_id","date");--> statement-breakpoint

-- ---- Jadwal kerja: tenant yang sudah ada mendapat jadwal bawaan (Senin–Jumat 08.00–17.00, sama dengan
-- DEFAULT_WORK_SCHEDULE di @exapay/shared). Diisi sebelum RLS diaktifkan; tenants terbaca lewat policy definer_select (app_owner).
INSERT INTO "work_schedule_days" ("tenant_id", "weekday", "is_workday", "start_time", "end_time")
SELECT t.id, d.weekday, d.weekday <= 5, '08:00', '17:00'
FROM "tenants" t CROSS JOIN generate_series(1, 7) AS d(weekday);--> statement-breakpoint

-- ---- Tabel tenant biasa. PK / index unik diawali tenant_id — melayani filter tenant tanpa index terpisah.
ALTER TABLE "work_schedule_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_schedule_days" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "work_schedule_days"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "work_schedule_days_set_updated_at" BEFORE UPDATE ON "work_schedule_days"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
ALTER TABLE "national_holiday_exclusions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "national_holiday_exclusions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "national_holiday_exclusions"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "national_holiday_exclusions_set_updated_at" BEFORE UPDATE ON "national_holiday_exclusions"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
ALTER TABLE "company_holidays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "company_holidays" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "company_holidays"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "company_holidays_set_updated_at" BEFORE UPDATE ON "company_holidays"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- Jadwal selalu 7 baris per tenant: app_user hanya mengubah (tanpa INSERT dari UI selain seed tenant baru, tanpa DELETE)
GRANT SELECT, INSERT, UPDATE ON "work_schedule_days" TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "national_holiday_exclusions" TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "company_holidays" TO app_user;--> statement-breakpoint

-- ---- Libur nasional: data referensi platform (pola provinces/regencies) — semua boleh membaca, app_user tanpa hak tulis.
-- Isi data lewat migration (0011 dst.), dijalankan app_owner.
ALTER TABLE "national_holidays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "national_holidays" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reference_read" ON "national_holidays" FOR SELECT USING (true);--> statement-breakpoint
GRANT SELECT ON "national_holidays" TO app_user;
