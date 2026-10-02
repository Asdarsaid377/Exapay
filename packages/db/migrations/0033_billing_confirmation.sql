CREATE TABLE "billing_confirmation_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"claimed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_txid" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_confirmation_tokens_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "billing_confirmation_tokens_used" CHECK (("billing_confirmation_tokens"."used_at" IS NULL) = ("billing_confirmation_tokens"."used_txid" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD COLUMN "decided_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD COLUMN "decision_source" text;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ADD COLUMN "price_per_employee_override" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ADD COLUMN "min_billed_employees_override" smallint;--> statement-breakpoint
ALTER TABLE "billing_confirmation_tokens" ADD CONSTRAINT "billing_confirmation_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_confirmation_tokens" ADD CONSTRAINT "billing_confirmation_tokens_invoice_fk" FOREIGN KEY ("tenant_id","invoice_id") REFERENCES "public"."billing_invoices"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_confirmation_tokens_tenant_invoice_idx" ON "billing_confirmation_tokens" USING btree ("tenant_id","invoice_id");--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_paid" CHECK (("billing_invoices"."status" = 'paid') = ("billing_invoices"."paid_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_rejection" CHECK (("billing_invoices"."rejection_reason" IS NULL) = ("billing_invoices"."rejected_at" IS NULL));--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_overrides" CHECK (("tenant_subscriptions"."price_per_employee_override" IS NULL OR "tenant_subscriptions"."price_per_employee_override" >= 0) AND ("tenant_subscriptions"."min_billed_employees_override" IS NULL OR "tenant_subscriptions"."min_billed_employees_override" >= 0));--> statement-breakpoint

-- =====================================================================
-- Feature 42: konfirmasi pembayaran (dashboard super-admin & tautan email tanpa login), kelola langganan, harga platform
-- =====================================================================

ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_decision_source" CHECK ("decision_source" IS NULL OR "decision_source" IN ('dashboard', 'email'));--> statement-breakpoint
-- Kolom keputusan bisa ditulis app_user; siapa yang boleh dijaga trigger guard_billing_invoice (di bawah)
GRANT UPDATE ("paid_at", "decided_by_user_id", "decision_source", "rejection_reason", "rejected_at") ON "billing_invoices" TO app_user;--> statement-breakpoint
-- Langganan kini bisa diubah (perpanjang/gratis/harga khusus/lunas) — trigger guard_tenant_subscription tetap membatasi ke
-- super-admin / transaksi bertoken konfirmasi
GRANT UPDATE ("status", "trial_ends_at", "current_period_ends_at", "price_per_employee_override", "min_billed_employees_override", "updated_at") ON "tenant_subscriptions" TO app_user;--> statement-breakpoint

-- ---- billing_confirmation_tokens: tabel tenant, hanya hash token. app_user: baca + buat (worker), tanpa UPDATE/DELETE —
-- pemakaian token hanya lewat billing_consume_confirmation (definer).
ALTER TABLE "billing_confirmation_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_confirmation_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "billing_confirmation_tokens"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
-- Fungsi SECURITY DEFINER milik app_owner (lookup & pakai token tanpa konteks tenant)
CREATE POLICY "definer_access" ON "billing_confirmation_tokens"
  USING (current_user = 'app_owner')
  WITH CHECK (current_user = 'app_owner');--> statement-breakpoint
GRANT SELECT ON "billing_confirmation_tokens" TO app_user;--> statement-breakpoint
GRANT INSERT ("tenant_id", "invoice_id", "token_hash", "claimed_at", "expires_at") ON "billing_confirmation_tokens" TO app_user;--> statement-breakpoint
-- Fungsi definer juga membaca tagihan & langganan untuk status token
CREATE POLICY "definer_select" ON "billing_invoices" FOR SELECT
  USING (current_user = 'app_owner');--> statement-breakpoint

-- Lookup token tanpa konteks (halaman konfirmasi dari email)
CREATE FUNCTION public.billing_find_confirmation(p_token_hash text)
  RETURNS TABLE (tenant_id uuid, invoice_id uuid, claimed_at timestamptz, expires_at timestamptz, used_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT t.tenant_id, t.invoice_id, t.claimed_at, t.expires_at, t.used_at FROM public.billing_confirmation_tokens t WHERE t.token_hash = p_token_hash $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.billing_find_confirmation(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.billing_find_confirmation(text) TO app_user;--> statement-breakpoint

-- Pakai token (sekali): hanya bila belum dipakai, belum kedaluwarsa, dan klaim tagihan masih klaim yang sama dan masih
-- menunggu konfirmasi. Mencatat txid transaksi ini → trigger guard mengizinkan keputusan atas tagihan & langganan usaha itu
-- HANYA di transaksi yang sama. Tidak ada baris = token tidak berlaku.
CREATE FUNCTION public.billing_consume_confirmation(p_token_hash text)
  RETURNS TABLE (tenant_id uuid, invoice_id uuid)
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  UPDATE public.billing_confirmation_tokens t
     SET used_at = now(), used_txid = txid_current()
    FROM public.billing_invoices i
   WHERE t.token_hash = p_token_hash
     AND t.used_at IS NULL
     AND t.expires_at > now()
     AND i.tenant_id = t.tenant_id AND i.id = t.invoice_id
     AND i.status = 'awaiting_confirmation' AND i.claimed_at = t.claimed_at
  RETURNING t.tenant_id, t.invoice_id
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.billing_consume_confirmation(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.billing_consume_confirmation(text) TO app_user;--> statement-breakpoint

-- Transaksi ini memakai token konfirmasi untuk usaha (dan tagihan, bila diberikan) tsb?
CREATE FUNCTION public.billing_tx_authorized(p_tenant_id uuid, p_invoice_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.billing_confirmation_tokens t
     WHERE t.used_txid = txid_current() AND t.tenant_id = p_tenant_id
       AND (p_invoice_id IS NULL OR t.invoice_id = p_invoice_id)
  )
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.billing_tx_authorized(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.billing_tx_authorized(uuid, uuid) TO app_user;--> statement-breakpoint

-- Antrean /admin/billing: tagihan menunggu konfirmasi seluruh usaha — hanya kolom tingkat platform (tanpa data karyawan
-- selain jumlah yang ditagih). Pola admin_tenant_overview (migration 0005).
CREATE FUNCTION public.admin_billing_queue()
  RETURNS TABLE (
    invoice_id uuid, tenant_id uuid, tenant_name text, number text, total_amount numeric, unique_code smallint,
    billed_employees integer, claimed_at timestamptz, due_at timestamptz, has_proof boolean
  )
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.current_app_is_super_admin() THEN
    RAISE EXCEPTION 'hanya super-admin yang boleh membaca antrean pembayaran' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT i.id, i.tenant_id, t.name, i.number, i.total_amount, i.unique_code, i.billed_employees, i.claimed_at, i.due_at,
         i.proof_key IS NOT NULL
    FROM public.billing_invoices i
    JOIN public.tenants t ON t.id = i.tenant_id
   WHERE i.status = 'awaiting_confirmation'
   ORDER BY i.claimed_at;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.admin_billing_queue() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.admin_billing_queue() TO app_user;--> statement-breakpoint

-- Tagihan: selain aturan feature 41 untuk anggota usaha/worker, keputusan (awaiting → paid / awaiting → open ditolak)
-- boleh oleh super-admin, app_owner, atau transaksi yang memakai token konfirmasi tagihan ini.
CREATE OR REPLACE FUNCTION public.guard_billing_invoice() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF current_user = 'app_owner' OR public.current_app_is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' OR NEW.claimed_at IS NOT NULL OR NEW.proof_key IS NOT NULL OR NEW.paid_at IS NOT NULL OR NEW.rejected_at IS NOT NULL THEN
      RAISE EXCEPTION 'tagihan baru harus berstatus open' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'awaiting_confirmation' AND NEW.status IN ('paid', 'open') AND public.billing_tx_authorized(OLD.tenant_id, OLD.id) THEN
    RETURN NEW;
  END IF;
  -- Klaim owner: keputusan sebelumnya (penolakan) tidak boleh diubah owner
  IF OLD.status = 'open' AND NEW.status = 'awaiting_confirmation' AND now() <= OLD.due_at
     AND NEW.paid_at IS NULL AND NEW.decided_by_user_id IS NOT DISTINCT FROM OLD.decided_by_user_id
     AND NEW.decision_source IS NOT DISTINCT FROM OLD.decision_source
     AND NEW.rejection_reason IS NOT DISTINCT FROM OLD.rejection_reason AND NEW.rejected_at IS NOT DISTINCT FROM OLD.rejected_at THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'open' AND NEW.status = 'expired' AND now() > OLD.due_at
     AND NEW.claimed_at IS NOT DISTINCT FROM OLD.claimed_at AND NEW.proof_key IS NOT DISTINCT FROM OLD.proof_key
     AND NEW.paid_at IS NULL AND NEW.rejection_reason IS NOT DISTINCT FROM OLD.rejection_reason THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'perubahan tagihan ini hanya boleh dilakukan super-admin' USING ERRCODE = 'insufficient_privilege';
END $$;--> statement-breakpoint

-- Langganan: + perpanjangan oleh transaksi bertoken konfirmasi usaha ini (lunas dari email)
CREATE OR REPLACE FUNCTION public.guard_tenant_subscription() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  max_trial_days integer;
BEGIN
  IF current_user = 'app_owner' OR public.current_app_is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    IF public.billing_tx_authorized(OLD.tenant_id, NULL)
       AND NEW.price_per_employee_override IS NOT DISTINCT FROM OLD.price_per_employee_override
       AND NEW.min_billed_employees_override IS NOT DISTINCT FROM OLD.min_billed_employees_override THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'langganan hanya boleh diubah super-admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT p.trial_days INTO max_trial_days FROM public.billing_prices p
   WHERE p.effective_from <= current_date AND (p.effective_to IS NULL OR p.effective_to >= current_date);
  IF NEW.status <> 'trialing' OR NEW.current_period_ends_at IS NOT NULL OR max_trial_days IS NULL
     OR NEW.price_per_employee_override IS NOT NULL OR NEW.min_billed_employees_override IS NOT NULL
     OR NEW.trial_ends_at > now() + make_interval(days => max_trial_days + 1) THEN
    RAISE EXCEPTION 'tenant baru hanya boleh dimulai dengan trial standar' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint

-- ---- billing_prices: versi baru oleh super-admin (/admin/billing) — menyimpang dari pola data referensi (biasanya hanya
-- migration) atas keputusan build-plan feature 42. Policy tulis terbuka; siapa & apa dijaga trigger guard_billing_prices:
-- hanya super-admin/app_owner; UPDATE hanya effective_to; DELETE hanya versi yang belum mulai berlaku.
CREATE POLICY "platform_insert" ON "billing_prices" FOR INSERT WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "platform_update" ON "billing_prices" FOR UPDATE USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "platform_delete" ON "billing_prices" FOR DELETE USING (true);--> statement-breakpoint
GRANT INSERT, DELETE ON "billing_prices" TO app_user;--> statement-breakpoint
GRANT UPDATE ("effective_to") ON "billing_prices" TO app_user;--> statement-breakpoint
CREATE FUNCTION public.guard_billing_prices() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF current_user <> 'app_owner' AND NOT public.current_app_is_super_admin() THEN
    RAISE EXCEPTION 'harga platform hanya boleh diubah super-admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF current_user <> 'app_owner' AND OLD.effective_from <= current_date THEN
      RAISE EXCEPTION 'versi harga yang sudah berlaku tidak bisa dihapus' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "billing_prices_guard" BEFORE INSERT OR UPDATE OR DELETE ON "billing_prices"
  FOR EACH ROW EXECUTE FUNCTION public.guard_billing_prices();
