-- Feature 47 Absensi Berbasis Roster: snapshot nama shift + tanda "Tanpa jadwal" di attendance_records; tinjauan
-- dipisah per subjek (lokasi / jadwal) agar absen masuk yang bertanda keduanya ditinjau terpisah. Baris lama = lokasi.
-- Grant tabel (SELECT/INSERT/UPDATE) sudah mencakup kolom baru.
CREATE TYPE "public"."attendance_review_subject" AS ENUM('location', 'schedule');--> statement-breakpoint
DROP INDEX "attendance_reviews_tenant_record_event_key";--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "shift_name" text;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "unscheduled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_reviews" ADD COLUMN "subject" "attendance_review_subject" DEFAULT 'location' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_reviews_tenant_record_event_subject_key" ON "attendance_reviews" USING btree ("tenant_id","attendance_record_id","event","subject");--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_shift_name" CHECK ("attendance_records"."shift_name" IS NULL OR (length("attendance_records"."shift_name") BETWEEN 1 AND 40 AND "attendance_records"."scheduled_start" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_unscheduled" CHECK (NOT "attendance_records"."unscheduled" OR ("attendance_records"."scheduled_start" IS NULL AND "attendance_records"."shift_name" IS NULL));--> statement-breakpoint
ALTER TABLE "attendance_reviews" ADD CONSTRAINT "attendance_reviews_schedule_check_in" CHECK ("attendance_reviews"."subject" <> 'schedule' OR "attendance_reviews"."event" = 'check_in');