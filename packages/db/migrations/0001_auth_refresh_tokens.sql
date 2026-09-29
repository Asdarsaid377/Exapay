CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"active_tenant_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_active_tenant_id_tenants_id_fk" FOREIGN KEY ("active_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint

-- =====================================================================
-- Bagian custom (ditulis manual): RLS refresh_tokens + akses auth (feature 03).
-- =====================================================================

-- ---- refresh_tokens: level user, bukan tenant ----
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "refresh_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "user_isolation" ON "refresh_tokens"
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());--> statement-breakpoint
CREATE TRIGGER "refresh_tokens_set_updated_at" BEFORE UPDATE ON "refresh_tokens"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "refresh_tokens" TO app_user;--> statement-breakpoint

-- ---- Pemilihan tenant aktif: user boleh melihat membership & tenant MILIKNYA di tenant lain ----
CREATE POLICY "own_memberships_select" ON "memberships" FOR SELECT
  USING (user_id = public.current_app_user_id());--> statement-breakpoint
CREATE POLICY "member_tenants_select" ON "tenants" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "memberships" m
      WHERE m.tenant_id = "tenants".id AND m.user_id = public.current_app_user_id()
    )
  );--> statement-breakpoint

-- ---- Login: cari user by email SEBELUM ada konteks ----
-- Satu-satunya jalur baca users tanpa konteks: fungsi SECURITY DEFINER milik app_owner.
-- Policy di bawah hanya berlaku untuk kode yang berjalan sebagai app_owner (fungsi definer & migration);
-- app_user tidak bisa menjadi app_owner, jadi ini bukan bypass untuk role runtime.
CREATE POLICY "definer_select" ON "users" FOR SELECT
  USING (current_user = 'app_owner');--> statement-breakpoint
CREATE FUNCTION public.auth_find_user_by_email(p_email text)
  RETURNS TABLE (id uuid, password_hash text, is_super_admin boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT u.id, u.password_hash, u.is_super_admin FROM public.users u WHERE lower(u.email) = lower(p_email) $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.auth_find_user_by_email(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.auth_find_user_by_email(text) TO app_user;
--> statement-breakpoint

-- ---- Pengaman eskalasi hak: is_super_admin hanya bisa diubah app_owner (migration/skrip terkontrol) ----
-- Policy users_insert_self / users_update_self mengizinkan user menulis barisnya sendiri; trigger ini
-- mencegah bug di API menaikkan diri menjadi super-admin.
CREATE FUNCTION public.guard_super_admin_flag() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF current_user <> 'app_owner'
     AND NEW.is_super_admin IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.is_super_admin ELSE false END) THEN
    RAISE EXCEPTION 'is_super_admin hanya boleh diubah oleh app_owner' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "users_guard_super_admin" BEFORE INSERT OR UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION public.guard_super_admin_flag();
