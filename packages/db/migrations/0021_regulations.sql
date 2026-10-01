CREATE TYPE "public"."bpjs_program" AS ENUM('kesehatan', 'jht', 'jp', 'jkk', 'jkm');--> statement-breakpoint
CREATE TYPE "public"."tax_rate_kind" AS ENUM('ter_a', 'ter_b', 'ter_c', 'pasal_17');--> statement-breakpoint
CREATE TABLE "bpjs_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program" "bpjs_program" NOT NULL,
	"jkk_risk_level" smallint,
	"employer_rate_percent" numeric(7, 4) NOT NULL,
	"employee_rate_percent" numeric(7, 4) NOT NULL,
	"wage_cap" numeric(18, 2),
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source" text NOT NULL,
	CONSTRAINT "bpjs_rates_date_order" CHECK ("bpjs_rates"."effective_to" IS NULL OR "bpjs_rates"."effective_to" >= "bpjs_rates"."effective_from"),
	CONSTRAINT "bpjs_rates_jkk_risk" CHECK (("bpjs_rates"."program" = 'jkk') = ("bpjs_rates"."jkk_risk_level" IS NOT NULL) AND coalesce("bpjs_rates"."jkk_risk_level" BETWEEN 1 AND 5, true)),
	CONSTRAINT "bpjs_rates_values" CHECK ("bpjs_rates"."employer_rate_percent" BETWEEN 0 AND 100 AND "bpjs_rates"."employee_rate_percent" BETWEEN 0 AND 100 AND coalesce("bpjs_rates"."wage_cap" > 0, true))
);
--> statement-breakpoint
CREATE TABLE "minimum_wages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"province_code" text,
	"regency_code" text,
	"monthly_amount" numeric(18, 2) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source" text NOT NULL,
	CONSTRAINT "minimum_wages_area" CHECK (num_nonnulls("minimum_wages"."province_code", "minimum_wages"."regency_code") = 1),
	CONSTRAINT "minimum_wages_date_order" CHECK ("minimum_wages"."effective_to" IS NULL OR "minimum_wages"."effective_to" >= "minimum_wages"."effective_from"),
	CONSTRAINT "minimum_wages_amount" CHECK ("minimum_wages"."monthly_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "pph21_parameters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occupational_cost_rate_percent" numeric(7, 4) NOT NULL,
	"occupational_cost_monthly_max" numeric(18, 2) NOT NULL,
	"occupational_cost_annual_max" numeric(18, 2) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source" text NOT NULL,
	CONSTRAINT "pph21_parameters_date_order" CHECK ("pph21_parameters"."effective_to" IS NULL OR "pph21_parameters"."effective_to" >= "pph21_parameters"."effective_from"),
	CONSTRAINT "pph21_parameters_values" CHECK ("pph21_parameters"."occupational_cost_rate_percent" BETWEEN 0 AND 100 AND "pph21_parameters"."occupational_cost_monthly_max" > 0 AND "pph21_parameters"."occupational_cost_annual_max" > 0)
);
--> statement-breakpoint
CREATE TABLE "ptkp_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "ptkp_status" NOT NULL,
	"annual_amount" numeric(18, 2) NOT NULL,
	"ter_kind" "tax_rate_kind" NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source" text NOT NULL,
	CONSTRAINT "ptkp_rates_date_order" CHECK ("ptkp_rates"."effective_to" IS NULL OR "ptkp_rates"."effective_to" >= "ptkp_rates"."effective_from"),
	CONSTRAINT "ptkp_rates_values" CHECK ("ptkp_rates"."annual_amount" > 0 AND "ptkp_rates"."ter_kind" <> 'pasal_17')
);
--> statement-breakpoint
CREATE TABLE "tax_rate_brackets" (
	"kind" "tax_rate_kind" NOT NULL,
	"effective_from" date NOT NULL,
	"seq" smallint NOT NULL,
	"income_up_to" numeric(18, 2),
	"rate_percent" numeric(7, 4) NOT NULL,
	CONSTRAINT "tax_rate_brackets_pkey" PRIMARY KEY("kind","effective_from","seq"),
	CONSTRAINT "tax_rate_brackets_values" CHECK ("tax_rate_brackets"."seq" >= 1 AND coalesce("tax_rate_brackets"."income_up_to" > 0, true) AND "tax_rate_brackets"."rate_percent" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "tax_rate_tables" (
	"kind" "tax_rate_kind" NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source" text NOT NULL,
	CONSTRAINT "tax_rate_tables_pkey" PRIMARY KEY("kind","effective_from"),
	CONSTRAINT "tax_rate_tables_date_order" CHECK ("tax_rate_tables"."effective_to" IS NULL OR "tax_rate_tables"."effective_to" >= "tax_rate_tables"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "minimum_wages" ADD CONSTRAINT "minimum_wages_province_code_provinces_code_fk" FOREIGN KEY ("province_code") REFERENCES "public"."provinces"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minimum_wages" ADD CONSTRAINT "minimum_wages_regency_code_regencies_code_fk" FOREIGN KEY ("regency_code") REFERENCES "public"."regencies"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rate_brackets" ADD CONSTRAINT "tax_rate_brackets_table_fk" FOREIGN KEY ("kind","effective_from") REFERENCES "public"."tax_rate_tables"("kind","effective_from") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- ---- Versi tidak boleh beririsan (rentang inklusif; effective_to null = tanpa batas atas). btree_gist sudah dibuat di 0013.
-- JKK dibedakan per kelompok risiko; program lain jkk_risk_level null → coalesce 0.
ALTER TABLE "bpjs_rates" ADD CONSTRAINT "bpjs_rates_no_overlap" EXCLUDE USING gist (
  "program" WITH =,
  (coalesce("jkk_risk_level", 0)) WITH =,
  daterange("effective_from", "effective_to", '[]') WITH &&
);--> statement-breakpoint
ALTER TABLE "tax_rate_tables" ADD CONSTRAINT "tax_rate_tables_no_overlap" EXCLUDE USING gist (
  "kind" WITH =,
  daterange("effective_from", "effective_to", '[]') WITH &&
);--> statement-breakpoint
ALTER TABLE "ptkp_rates" ADD CONSTRAINT "ptkp_rates_no_overlap" EXCLUDE USING gist (
  "status" WITH =,
  daterange("effective_from", "effective_to", '[]') WITH &&
);--> statement-breakpoint
ALTER TABLE "pph21_parameters" ADD CONSTRAINT "pph21_parameters_no_overlap" EXCLUDE USING gist (
  daterange("effective_from", "effective_to", '[]') WITH &&
);--> statement-breakpoint
-- Kode provinsi ("73") dan kota ("73.71") berbeda format → satu kolom area cukup sebagai kunci
ALTER TABLE "minimum_wages" ADD CONSTRAINT "minimum_wages_no_overlap" EXCLUDE USING gist (
  (coalesce("regency_code", "province_code")) WITH =,
  daterange("effective_from", "effective_to", '[]') WITH &&
);--> statement-breakpoint

-- ---- Data referensi platform (pola provinces/national_holidays): RLS + FORCE, semua boleh membaca, app_user tanpa hak tulis.
ALTER TABLE "bpjs_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bpjs_rates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reference_read" ON "bpjs_rates" FOR SELECT USING (true);--> statement-breakpoint
ALTER TABLE "tax_rate_tables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tax_rate_tables" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reference_read" ON "tax_rate_tables" FOR SELECT USING (true);--> statement-breakpoint
ALTER TABLE "tax_rate_brackets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tax_rate_brackets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reference_read" ON "tax_rate_brackets" FOR SELECT USING (true);--> statement-breakpoint
ALTER TABLE "ptkp_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ptkp_rates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reference_read" ON "ptkp_rates" FOR SELECT USING (true);--> statement-breakpoint
ALTER TABLE "pph21_parameters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pph21_parameters" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reference_read" ON "pph21_parameters" FOR SELECT USING (true);--> statement-breakpoint
ALTER TABLE "minimum_wages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "minimum_wages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reference_read" ON "minimum_wages" FOR SELECT USING (true);--> statement-breakpoint
GRANT SELECT ON "bpjs_rates", "tax_rate_tables", "tax_rate_brackets", "ptkp_rates", "pph21_parameters", "minimum_wages" TO app_user;
