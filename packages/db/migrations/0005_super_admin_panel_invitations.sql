CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_tenant_email_idx" ON "invitations" USING btree ("tenant_id",lower("email"));--> statement-breakpoint

-- =====================================================================
-- Bagian custom (ditulis manual): panel super-admin + undangan (feature 07).
-- Super-admin TIDAK diberi policy RLS apa pun. Baca lintas tenant hanya lewat admin_tenant_overview()
-- (SECURITY DEFINER) yang mengembalikan kolom tingkat platform saja — tabel karyawan/gaji tidak terjangkau.
-- Tulis (buat tenant, nonaktifkan) memakai konteks tenant target seperti biasa + cek flag di transaksi.
-- =====================================================================

-- Flag super-admin dari DATABASE untuk app.user_id (bukan dari klaim JWT yang bisa basi 15 menit)
CREATE FUNCTION public.current_app_is_super_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT coalesce((SELECT u.is_super_admin FROM public.users u WHERE u.id = public.current_app_user_id()), false) $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.current_app_is_super_admin() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.current_app_is_super_admin() TO app_user;--> statement-breakpoint

-- Fungsi SECURITY DEFINER milik app_owner perlu membaca tabel-tabel ini (pola sama dengan users.definer_select)
CREATE POLICY "definer_select" ON "tenants" FOR SELECT
  USING (current_user = 'app_owner');--> statement-breakpoint
CREATE POLICY "definer_select" ON "memberships" FOR SELECT
  USING (current_user = 'app_owner');--> statement-breakpoint

-- ---- tenants.deactivated_at: hanya super-admin (atau app_owner) yang boleh mengubah ----
-- Policy tenant_isolation mengizinkan anggota tenant meng-update baris tenant-nya (mis. profil usaha, feature 09);
-- trigger ini mencegah bug di API mengaktifkan kembali tenant yang dinonaktifkan super-admin.
CREATE FUNCTION public.guard_tenant_deactivation() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.deactivated_at IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.deactivated_at ELSE NULL END)
     AND current_user <> 'app_owner'
     AND NOT public.current_app_is_super_admin() THEN
    RAISE EXCEPTION 'status aktif tenant hanya boleh diubah super-admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "tenants_guard_deactivation" BEFORE INSERT OR UPDATE ON "tenants"
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_deactivation();--> statement-breakpoint

-- ---- invitations: tabel tenant biasa ----
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "invitations"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
CREATE POLICY "definer_select" ON "invitations" FOR SELECT
  USING (current_user = 'app_owner');--> statement-breakpoint
CREATE TRIGGER "invitations_set_updated_at" BEFORE UPDATE ON "invitations"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "invitations" TO app_user;--> statement-breakpoint

-- Tautan undangan dibuka tanpa login: cari tenant pemilik undangan dari hash token, lalu API lanjut dengan konteks tenant itu
CREATE FUNCTION public.auth_find_invitation(p_token_hash text)
  RETURNS TABLE (id uuid, tenant_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT i.id, i.tenant_id FROM public.invitations i WHERE i.token_hash = p_token_hash $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.auth_find_invitation(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.auth_find_invitation(text) TO app_user;--> statement-breakpoint

-- ---- Ringkasan tenant untuk panel super-admin ----
-- Satu baris per tenant: identitas, status, pemilik (atau undangan pemilik terakhir), jumlah anggota per peran.
-- Kolom yang dikembalikan adalah BATAS data yang boleh dilihat super-admin — jangan tambah data karyawan/gaji.
CREATE FUNCTION public.admin_tenant_overview()
  RETURNS TABLE (
    id uuid,
    name text,
    created_at timestamptz,
    deactivated_at timestamptz,
    owner_full_name text,
    owner_email text,
    owner_email_verified boolean,
    invite_full_name text,
    invite_email text,
    invite_created_at timestamptz,
    invite_expires_at timestamptz,
    owner_count integer,
    admin_count integer,
    atasan_count integer,
    karyawan_count integer,
    pending_invitations integer
  )
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.current_app_is_super_admin() THEN
    RAISE EXCEPTION 'hanya super-admin yang boleh membaca ringkasan tenant' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    t.id, t.name, t.created_at, t.deactivated_at,
    o.full_name, o.email, o.email_verified_at IS NOT NULL,
    inv.full_name, inv.email, inv.created_at, inv.expires_at,
    coalesce(c.owner_count, 0)::integer, coalesce(c.admin_count, 0)::integer,
    coalesce(c.atasan_count, 0)::integer, coalesce(c.karyawan_count, 0)::integer,
    (SELECT count(*)::integer FROM public.invitations p
       WHERE p.tenant_id = t.id AND p.accepted_at IS NULL AND p.expires_at > now())
  FROM public.tenants t
  LEFT JOIN LATERAL (
    SELECT u.full_name, u.email, u.email_verified_at
    FROM public.memberships m JOIN public.users u ON u.id = m.user_id
    WHERE m.tenant_id = t.id AND m.role = 'owner'
    ORDER BY m.created_at
    LIMIT 1
  ) o ON true
  LEFT JOIN LATERAL (
    SELECT i.full_name, i.email, i.created_at, i.expires_at
    FROM public.invitations i
    WHERE i.tenant_id = t.id AND i.role = 'owner' AND i.accepted_at IS NULL
    ORDER BY i.created_at DESC
    LIMIT 1
  ) inv ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE m.role = 'owner') AS owner_count,
      count(*) FILTER (WHERE m.role = 'admin') AS admin_count,
      count(*) FILTER (WHERE m.role = 'atasan') AS atasan_count,
      count(*) FILTER (WHERE m.role = 'karyawan') AS karyawan_count
    FROM public.memberships m
    WHERE m.tenant_id = t.id
  ) c ON true;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.admin_tenant_overview() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.admin_tenant_overview() TO app_user;
