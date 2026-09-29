CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint

-- =====================================================================
-- Bagian custom (ditulis manual): RLS + lookup token reset (feature 04).
-- =====================================================================

ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "user_isolation" ON "password_reset_tokens"
  USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());--> statement-breakpoint
-- Sama seperti users.definer_select: hanya untuk fungsi SECURITY DEFINER milik app_owner
CREATE POLICY "definer_select" ON "password_reset_tokens" FOR SELECT
  USING (current_user = 'app_owner');--> statement-breakpoint
CREATE TRIGGER "password_reset_tokens_set_updated_at" BEFORE UPDATE ON "password_reset_tokens"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "password_reset_tokens" TO app_user;--> statement-breakpoint

-- Link reset dibuka tanpa login: cari pemilik token dari hash-nya, lalu API lanjut dengan konteks user itu
CREATE FUNCTION public.auth_find_password_reset(p_token_hash text)
  RETURNS TABLE (id uuid, user_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ SELECT t.id, t.user_id FROM public.password_reset_tokens t WHERE t.token_hash = p_token_hash $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.auth_find_password_reset(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.auth_find_password_reset(text) TO app_user;
