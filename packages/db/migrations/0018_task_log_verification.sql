ALTER TABLE "task_logs" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_logs" ADD COLUMN "verified_quantity" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "task_logs" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_logs" ADD COLUMN "decided_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "task_logs" ADD COLUMN "decided_by_name" text;--> statement-breakpoint
ALTER TABLE "task_logs" ADD COLUMN "decision_note" text;--> statement-breakpoint
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_logs_tenant_status_date_idx" ON "task_logs" USING btree ("tenant_id","status","work_date");--> statement-breakpoint
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_decision" CHECK (("task_logs"."status" <> 'pending') = ("task_logs"."decided_at" IS NOT NULL) AND ("task_logs"."decided_at" IS NOT NULL OR ("task_logs"."decided_by_user_id" IS NULL AND "task_logs"."decided_by_name" IS NULL AND "task_logs"."decision_note" IS NULL)));--> statement-breakpoint
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_verified_quantity" CHECK (("task_logs"."verified_quantity" IS NOT NULL) = ("task_logs"."status" = 'approved' AND "task_logs"."indicator_id" IS NOT NULL) AND coalesce("task_logs"."verified_quantity" > 0, true));--> statement-breakpoint
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_decision_note" CHECK (("task_logs"."decision_note" IS NULL OR char_length("task_logs"."decision_note") BETWEEN 1 AND 500) AND ("task_logs"."status" <> 'rejected' OR "task_logs"."decision_note" IS NOT NULL) AND ("task_logs"."verified_quantity" IS NULL OR "task_logs"."verified_quantity" = "task_logs"."quantity" OR "task_logs"."decision_note" IS NOT NULL));--> statement-breakpoint

-- ---- Verifikasi atasan (feature 20). Semua baris lama masih pending, jadi CHECK baru langsung terpenuhi.
-- Label "Diubah" di portal kini memakai edited_at (updated_at ikut berubah saat diverifikasi):
-- baris yang pernah diubah karyawan sebelum migration ini diisi dari updated_at.
UPDATE "task_logs" SET "edited_at" = "updated_at" WHERE "updated_at" <> "created_at";
-- Grant app_user (SELECT/INSERT/UPDATE/DELETE) dari 0017 berlaku untuk kolom baru. Isi keputusan dijaga service:
-- hanya pending → approved/rejected, satu kali, oleh atasan langsung atau owner/admin (audit task_log approve/reject/correct).
