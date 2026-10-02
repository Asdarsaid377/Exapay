CREATE TYPE "public"."billing_invoice_status" AS ENUM('open', 'awaiting_confirmation', 'paid', 'expired');--> statement-breakpoint
CREATE TABLE "billing_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"status" "billing_invoice_status" DEFAULT 'open' NOT NULL,
	"period_start" date NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"price_per_employee" numeric(18, 2) NOT NULL,
	"min_billed_employees" smallint NOT NULL,
	"active_employees" integer NOT NULL,
	"billed_employees" integer NOT NULL,
	"base_amount" numeric(18, 2) NOT NULL,
	"unique_code" smallint NOT NULL,
	"total_amount" numeric(18, 2) NOT NULL,
	"payment_method" text DEFAULT 'qris-manual' NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by_user_id" uuid,
	"proof_key" text,
	"proof_name" text,
	"proof_type" text,
	"proof_size" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_invoices_number_key" UNIQUE("number"),
	CONSTRAINT "billing_invoices_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "billing_invoices_amounts" CHECK ("billing_invoices"."price_per_employee" >= 0 AND "billing_invoices"."min_billed_employees" >= 0 AND "billing_invoices"."active_employees" >= 0 AND "billing_invoices"."billed_employees" = GREATEST("billing_invoices"."active_employees", "billing_invoices"."min_billed_employees") AND "billing_invoices"."base_amount" = "billing_invoices"."price_per_employee" * "billing_invoices"."billed_employees" AND "billing_invoices"."unique_code" BETWEEN 1 AND 999 AND "billing_invoices"."total_amount" = "billing_invoices"."base_amount" + "billing_invoices"."unique_code"),
	CONSTRAINT "billing_invoices_due_after_issue" CHECK ("billing_invoices"."due_at" > "billing_invoices"."issued_at"),
	CONSTRAINT "billing_invoices_claim" CHECK ("billing_invoices"."status" <> 'awaiting_confirmation' OR "billing_invoices"."claimed_at" IS NOT NULL),
	CONSTRAINT "billing_invoices_proof" CHECK (("billing_invoices"."proof_key" IS NULL) = ("billing_invoices"."proof_name" IS NULL) AND ("billing_invoices"."proof_key" IS NULL) = ("billing_invoices"."proof_type" IS NULL) AND ("billing_invoices"."proof_key" IS NULL) = ("billing_invoices"."proof_size" IS NULL) AND ("billing_invoices"."proof_key" IS NULL OR "billing_invoices"."claimed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_claimed_by_fk" FOREIGN KEY ("tenant_id","claimed_by_user_id") REFERENCES "public"."memberships"("tenant_id","user_id") ON DELETE SET NULL ("claimed_by_user_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_invoices_tenant_issued_idx" ON "billing_invoices" USING btree ("tenant_id","issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_invoices_live_tenant_key" ON "billing_invoices" USING btree ("tenant_id") WHERE "billing_invoices"."status" IN ('open', 'awaiting_confirmation');--> statement-breakpoint
CREATE UNIQUE INDEX "billing_invoices_live_amount_key" ON "billing_invoices" USING btree ("total_amount") WHERE "billing_invoices"."status" IN ('open', 'awaiting_confirmation');--> statement-breakpoint

-- ---- billing_invoices: tabel tenant (feature 41) ----
-- FK pengklaim: ON DELETE SET NULL ("claimed_by_user_id") (PG 15+) — SET NULL biasa ikut mengosongkan tenant_id.
-- Index unik parsial *_live_amount_key berlaku lintas tenant (index tidak melewati RLS): nominal tagihan berjalan
-- tidak pernah sama, tanpa perlu membaca tagihan usaha lain. Worker memilih kode unik acak dan mencoba ulang bila bentrok.
ALTER TABLE "billing_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "billing_invoices"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE TRIGGER "billing_invoices_set_updated_at" BEFORE UPDATE ON "billing_invoices"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
-- Rincian & nominal tidak bisa diubah app_user (grant UPDATE per kolom); tanpa DELETE.
GRANT SELECT, INSERT ON "billing_invoices" TO app_user;--> statement-breakpoint
GRANT UPDATE ("status", "claimed_at", "claimed_by_user_id", "proof_key", "proof_name", "proof_type", "proof_size", "updated_at") ON "billing_invoices" TO app_user;--> statement-breakpoint

-- Transisi yang boleh dilakukan anggota usaha / worker (bukan super-admin):
--   INSERT hanya tagihan open tanpa klaim (worker)
--   open → awaiting_confirmation (owner "Saya sudah bayar", sebelum batas bayar)
--   open → expired (worker, setelah batas bayar)
-- Lunas / tolak / ubah lainnya hanya super-admin atau app_owner (feature 42).
CREATE FUNCTION public.guard_billing_invoice() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF current_user = 'app_owner' OR public.current_app_is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' OR NEW.claimed_at IS NOT NULL OR NEW.proof_key IS NOT NULL THEN
      RAISE EXCEPTION 'tagihan baru harus berstatus open' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'open' AND NEW.status = 'awaiting_confirmation' AND now() <= OLD.due_at THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'open' AND NEW.status = 'expired' AND now() > OLD.due_at
     AND NEW.claimed_at IS NOT DISTINCT FROM OLD.claimed_at AND NEW.proof_key IS NOT DISTINCT FROM OLD.proof_key THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'perubahan tagihan ini hanya boleh dilakukan super-admin' USING ERRCODE = 'insufficient_privilege';
END $$;--> statement-breakpoint
CREATE TRIGGER "billing_invoices_guard" BEFORE INSERT OR UPDATE ON "billing_invoices"
  FOR EACH ROW EXECUTE FUNCTION public.guard_billing_invoice();
