-- Feature 42 (perbaikan 0033): Drizzle selalu menyebut semua kolom saat INSERT (termasuk used_at/used_txid bernilai
-- DEFAULT), sehingga GRANT INSERT per kolom menolak insert token oleh worker. Ganti dengan GRANT INSERT tabel + trigger:
-- token baru tidak boleh sudah berstatus terpakai (used_* hanya diisi billing_consume_confirmation milik app_owner).
GRANT INSERT ON "billing_confirmation_tokens" TO app_user;--> statement-breakpoint
CREATE FUNCTION public.guard_billing_confirmation_token() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF current_user <> 'app_owner' AND (NEW.used_at IS NOT NULL OR NEW.used_txid IS NOT NULL) THEN
    RAISE EXCEPTION 'token konfirmasi baru tidak boleh berstatus terpakai' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "billing_confirmation_tokens_guard" BEFORE INSERT ON "billing_confirmation_tokens"
  FOR EACH ROW EXECUTE FUNCTION public.guard_billing_confirmation_token();
