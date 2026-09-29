CREATE TABLE "email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint

-- =====================================================================
-- Bagian custom (ditulis manual): backfill, RLS + lookup token verifikasi (feature 05).
-- =====================================================================

-- Akun yang sudah ada (seed dev / dibuat sebelum feature 05) dianggap terverifikasi.
-- FORCE RLS juga berlaku untuk owner dan tidak ada policy UPDATE untuk migration → UPDATE akan kena 0 baris
-- tanpa error. FORCE dilepas sebentar di transaksi migration ini lalu dipasang lagi.
ALTER TABLE "users" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

ALTER TABLE "email_verification_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "user_isolation" ON "email_verification_tokens"
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());--> statement-breakpoint
-- Sama seperti users.definer_select: hanya untuk fungsi SECURITY DEFINER milik app_owner
CREATE POLICY "definer_select" ON "email_verification_tokens" FOR SELECT
  USING (current_user = 'app_owner');--> statement-breakpoint
CREATE TRIGGER "email_verification_tokens_set_updated_at" BEFORE UPDATE ON "email_verification_tokens"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "email_verification_tokens" TO app_user;--> statement-breakpoint

-- Link verifikasi dibuka tanpa login: cari pemilik token dari hash-nya, lalu API lanjut dengan konteks user itu
CREATE FUNCTION public.auth_find_email_verification(p_token_hash text)
  RETURNS TABLE (id uuid, user_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT t.id, t.user_id FROM public.email_verification_tokens t WHERE t.token_hash = p_token_hash $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.auth_find_email_verification(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.auth_find_email_verification(text) TO app_user;--> statement-breakpoint

-- Login & signup perlu status verifikasi sebelum ada konteks. Tipe kembalian berubah → DROP + CREATE (grant ikut ulang).
DROP FUNCTION public.auth_find_user_by_email(text);--> statement-breakpoint
CREATE FUNCTION public.auth_find_user_by_email(p_email text)
  RETURNS TABLE (id uuid, password_hash text, is_super_admin boolean, email_verified_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT u.id, u.password_hash, u.is_super_admin, u.email_verified_at FROM public.users u WHERE lower(u.email) = lower(p_email) $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.auth_find_user_by_email(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.auth_find_user_by_email(text) TO app_user;
