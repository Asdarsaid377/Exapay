CREATE TABLE "provinces" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"time_zone" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regencies" (
	"code" text PRIMARY KEY NOT NULL,
	"province_code" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "npwp" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "regency_code" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "payday" smallint;--> statement-breakpoint
ALTER TABLE "regencies" ADD CONSTRAINT "regencies_province_code_provinces_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."provinces"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "regencies_province_code_idx" ON "regencies" USING btree ("province_code");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_regency_code_regencies_code_fk" FOREIGN KEY ("regency_code") REFERENCES "public"."regencies"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_npwp_format" CHECK ("tenants"."npwp" ~ '^[0-9]{15,16}$');--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_payday_range" CHECK ("tenants"."payday" between 1 and 31);--> statement-breakpoint

-- ---- Referensi wilayah: data platform (bukan data tenant). Tetap RLS + FORCE agar konsisten
-- (test "semua tabel public RLS + FORCE"); semua orang boleh membaca, app_user tidak bisa menulis (tanpa grant).
-- Isi data lewat migration (0007), dijalankan app_owner.
ALTER TABLE "provinces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "provinces" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reference_read" ON "provinces" FOR SELECT USING (true);--> statement-breakpoint
ALTER TABLE "regencies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "regencies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reference_read" ON "regencies" FOR SELECT USING (true);--> statement-breakpoint
GRANT SELECT ON "provinces", "regencies" TO app_user;
