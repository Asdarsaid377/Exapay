CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'complimentary');--> statement-breakpoint
CREATE TABLE "billing_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price_per_employee" numeric(18, 2) NOT NULL,
	"min_billed_employees" smallint NOT NULL,
	"trial_days" smallint NOT NULL,
	"grace_days" smallint NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_prices_date_order" CHECK ("billing_prices"."effective_to" IS NULL OR "billing_prices"."effective_to" >= "billing_prices"."effective_from"),
	CONSTRAINT "billing_prices_values" CHECK ("billing_prices"."price_per_employee" >= 0 AND "billing_prices"."min_billed_employees" >= 0 AND "billing_prices"."trial_days" BETWEEN 0 AND 365 AND "billing_prices"."grace_days" BETWEEN 0 AND 90)
);
--> statement-breakpoint
CREATE TABLE "tenant_subscriptions" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"status" "subscription_status" NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_subscriptions_dates" CHECK (("tenant_subscriptions"."status" <> 'trialing' OR "tenant_subscriptions"."trial_ends_at" IS NOT NULL) AND ("tenant_subscriptions"."status" <> 'active' OR "tenant_subscriptions"."current_period_ends_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- ---- billing_prices: data platform berlaku-tanggal (pola regulasi 0021). Versi tidak beririsan. btree_gist ada sejak 0013.
ALTER TABLE "billing_prices" ADD CONSTRAINT "billing_prices_no_overlap" EXCLUDE USING gist (
  daterange("effective_from", "effective_to", '[]') WITH &&
);--> statement-breakpoint
-- Harga awal (keputusan user 2026-10-02): Rp10.000 per karyawan aktif per bulan, minimum ditagih 5 karyawan,
-- trial 30 hari, tenggang 7 hari. Berlaku sejak 2024-01-01 (sama dengan cakupan data regulasi; menutupi tanggal di test).
-- Diisi sebelum RLS diaktifkan (pemilik tabel tanpa RLS) — tabel ini hanya punya policy SELECT.
INSERT INTO "billing_prices" ("price_per_employee", "min_billed_employees", "trial_days", "grace_days", "effective_from", "note")
VALUES (10000, 5, 30, 7, '2024-01-01', 'Harga awal Phase 9 (keputusan user 2026-10-02)');--> statement-breakpoint
ALTER TABLE "billing_prices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_prices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reference_read" ON "billing_prices" FOR SELECT USING (true);--> statement-breakpoint
GRANT SELECT ON "billing_prices" TO app_user;--> statement-breakpoint

-- ---- tenant_subscriptions: tabel tenant (tenant_id = primary key) ----
-- Tenant yang sudah ada sebelum Phase 9 (termasuk klien uji coba) → gratis/pilot; super-admin mengatur manual.
-- Backfill sebelum RLS diaktifkan (pemilik tabel tanpa RLS).
INSERT INTO "tenant_subscriptions" ("tenant_id", "status")
SELECT "id", 'complimentary' FROM "tenants";--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_subscriptions"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "tenant_subscriptions_set_updated_at" BEFORE UPDATE ON "tenant_subscriptions"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- Hanya membuat baris (signup / tenant baru). UPDATE (pembayaran, kelola super-admin) menyusul di feature 41/42.
GRANT SELECT, INSERT ON "tenant_subscriptions" TO app_user;--> statement-breakpoint

-- Pengaman di database: anggota tenant biasa hanya boleh membuat baris TRIAL dengan lama ≤ trial_days harga berlaku
-- (+1 hari toleransi zona waktu). Status lain / perubahan apa pun hanya super-admin atau app_owner.
CREATE FUNCTION public.guard_tenant_subscription() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  max_trial_days integer;
BEGIN
  IF current_user = 'app_owner' OR public.current_app_is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'langganan hanya boleh diubah super-admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT p.trial_days INTO max_trial_days FROM public.billing_prices p
   WHERE p.effective_from <= current_date AND (p.effective_to IS NULL OR p.effective_to >= current_date);
  IF NEW.status <> 'trialing' OR NEW.current_period_ends_at IS NOT NULL OR max_trial_days IS NULL
     OR NEW.trial_ends_at > now() + make_interval(days => max_trial_days + 1) THEN
    RAISE EXCEPTION 'tenant baru hanya boleh dimulai dengan trial standar' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "tenant_subscriptions_guard" BEFORE INSERT OR UPDATE ON "tenant_subscriptions"
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_subscription();
