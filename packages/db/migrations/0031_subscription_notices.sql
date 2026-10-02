CREATE TYPE "public"."subscription_notice_kind" AS ENUM('trial_h7', 'trial_h3', 'trial_h1', 'grace_started', 'read_only');--> statement-breakpoint
CREATE TABLE "subscription_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "subscription_notice_kind" NOT NULL,
	"period_ends_at" timestamp with time zone NOT NULL,
	"recipient_count" smallint NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_notices_once" UNIQUE("tenant_id","kind","period_ends_at")
);
--> statement-breakpoint
ALTER TABLE "subscription_notices" ADD CONSTRAINT "subscription_notices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- ---- subscription_notices: tabel tenant, append-only (feature 40). Tanpa updated_at — baris tidak pernah diubah.
-- Index unik (tenant_id, kind, period_ends_at) sekaligus melayani filter tenant.
ALTER TABLE "subscription_notices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscription_notices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "subscription_notices"
  USING (tenant_id = public.current_app_tenant_id())
  WITH CHECK (tenant_id = public.current_app_tenant_id());--> statement-breakpoint
GRANT SELECT, INSERT ON "subscription_notices" TO app_user;
