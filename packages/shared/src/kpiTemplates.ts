import { z } from "zod";

// Template KPI per jabatan (feature 18, /kpi/templates). Satu template bisa dipakai beberapa jabatan;
// tiap jabatan maksimal satu template. Skor dihitung di feature 21 dari indikator ini
// (capaian = realisasi ÷ target, maks 120%; skor = Σ capaian × bobot).

// Tipe indikator:
// - numeric: nilai angka (mis. nilai penjualan Rp), target boleh 2 desimal
// - count:   jumlah/hitungan (mis. transaksi dilayani), target bilangan bulat
// - rating:  penilaian atasan skala 1–KPI_RATING_SCALE_MAX, target = nilai tertinggi skala
// - system:  otomatis dari data sistem (kehadiran dari rekap absensi), target dalam persen
export const KPI_INDICATOR_TYPES = ["numeric", "count", "rating", "system"] as const;
export type KpiIndicatorType = (typeof KPI_INDICATOR_TYPES)[number];

// Satuan waktu target numeric/count — diprorata per hari kerja saat skor dihitung (feature 21)
export const KPI_TARGET_PERIODS = ["daily", "weekly", "monthly"] as const;
export type KpiTargetPeriod = (typeof KPI_TARGET_PERIODS)[number];

// Sumber data indikator otomatis. attendance_rate = hari hadir ÷ hari kerja (rekap absensi, feature 16)
export const KPI_SYSTEM_METRICS = ["attendance_rate"] as const;
export type KpiSystemMetric = (typeof KPI_SYSTEM_METRICS)[number];

export const KPI_RATING_SCALE_MAX = 5;
export const KPI_WEIGHT_TOTAL = 100;
export const KPI_INDICATORS_MAX = 10;
export const KPI_UNIT_MAX = 20;

// Target dikirim sebagai string desimal (numeric(18,2) di DB) — tidak pernah number
const DECIMAL_TARGET = /^[0-9]{1,13}(\.[0-9]{1,2})?$/;
const INTEGER_TARGET = /^[0-9]{1,9}$/;
const isPositive = (value: string): boolean => /[1-9]/.test(value);

const decimalTargetSchema = z
  .string("Target wajib diisi")
  .regex(DECIMAL_TARGET, "Target berupa angka, maksimal 2 angka di belakang koma")
  .refine(isPositive, "Target harus lebih dari 0");
const integerTargetSchema = z
  .string("Target wajib diisi")
  .regex(INTEGER_TARGET, "Target berupa bilangan bulat")
  .refine(isPositive, "Target harus lebih dari 0");
const percentTargetSchema = integerTargetSchema.refine((value) => Number(value) <= 100, "Target maksimal 100%");

const unitSchema = z.string("Satuan wajib diisi").trim().min(1, "Satuan wajib diisi").max(KPI_UNIT_MAX, `Satuan maksimal ${KPI_UNIT_MAX} karakter`);
const periodSchema = z.enum(KPI_TARGET_PERIODS, "Pilih satuan waktu target");

const indicatorBase = {
  // Ada = indikator lama yang diubah; tidak ada = indikator baru
  id: z.uuid().optional(),
  name: z.string("Nama indikator wajib diisi").trim().min(2, "Nama indikator minimal 2 karakter").max(80, "Nama indikator maksimal 80 karakter"),
  weight: z.number("Bobot wajib diisi").int("Bobot berupa bilangan bulat").min(1, "Bobot minimal 1%").max(KPI_WEIGHT_TOTAL, "Bobot maksimal 100%"),
};

export const kpiIndicatorInputSchema = z.discriminatedUnion("type", [
  z.object({ ...indicatorBase, type: z.literal("numeric"), unit: unitSchema, target: decimalTargetSchema, targetPeriod: periodSchema }),
  z.object({ ...indicatorBase, type: z.literal("count"), unit: unitSchema, target: integerTargetSchema, targetPeriod: periodSchema }),
  z.object({ ...indicatorBase, type: z.literal("rating") }),
  z.object({ ...indicatorBase, type: z.literal("system"), systemMetric: z.enum(KPI_SYSTEM_METRICS), target: percentTargetSchema }),
]);
export type KpiIndicatorInput = z.infer<typeof kpiIndicatorInputSchema>;

export const kpiTemplateInputSchema = z
  .object({
    name: z.string("Nama template wajib diisi").trim().min(2, "Nama template minimal 2 karakter").max(80, "Nama template maksimal 80 karakter"),
    description: z
      .string()
      .trim()
      .max(300, "Keterangan maksimal 300 karakter")
      .nullable()
      .transform((value) => (value ? value : null)),
    positionIds: z.array(z.uuid("Jabatan tidak valid")).max(200),
    indicators: z.array(kpiIndicatorInputSchema).min(1, "Tambahkan minimal satu indikator").max(KPI_INDICATORS_MAX, `Maksimal ${KPI_INDICATORS_MAX} indikator`),
  })
  .superRefine((input, ctx) => {
    const total = input.indicators.reduce((sum, indicator) => sum + indicator.weight, 0);
    if (total !== KPI_WEIGHT_TOTAL) {
      ctx.addIssue({ code: "custom", path: ["indicators"], message: `Total bobot harus ${KPI_WEIGHT_TOTAL}% (sekarang ${total}%)` });
    }
    const names = new Set<string>();
    input.indicators.forEach((indicator, index) => {
      const key = indicator.name.toLowerCase();
      if (names.has(key)) ctx.addIssue({ code: "custom", path: ["indicators", index, "name"], message: "Nama indikator sudah dipakai di template ini" });
      names.add(key);
    });
    const metrics = new Set<KpiSystemMetric>();
    input.indicators.forEach((indicator, index) => {
      if (indicator.type !== "system") return;
      if (metrics.has(indicator.systemMetric)) {
        ctx.addIssue({ code: "custom", path: ["indicators", index, "type"], message: "Indikator otomatis yang sama sudah ada di template ini" });
      }
      metrics.add(indicator.systemMetric);
    });
    const ids = input.indicators.flatMap((indicator) => (indicator.id ? [indicator.id] : []));
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["indicators"], message: "Indikator tidak valid" });
    if (new Set(input.positionIds).size !== input.positionIds.length) ctx.addIssue({ code: "custom", path: ["positionIds"], message: "Jabatan dipilih lebih dari sekali" });
  });
export type KpiTemplateInput = z.input<typeof kpiTemplateInputSchema>;
export type KpiTemplateData = z.output<typeof kpiTemplateInputSchema>;

export type KpiIndicator = {
  id: string;
  name: string;
  type: KpiIndicatorType;
  // numeric/count saja
  unit: string | null;
  // String desimal tanpa nol di belakang ("50000000", "2.5"); rating = skala maksimum, system = persen
  target: string;
  targetPeriod: KpiTargetPeriod | null;
  systemMetric: KpiSystemMetric | null;
  weight: number;
};

export type KpiTemplatePosition = { id: string; name: string };

export type KpiTemplate = {
  id: string;
  name: string;
  description: string | null;
  // Berasal dari template bawaan (tetap bisa diubah)
  builtin: boolean;
  positions: KpiTemplatePosition[];
  indicators: KpiIndicator[];
  updatedAt: string;
};

// Jabatan usaha + template yang dipakainya (pilihan jabatan di editor)
export type KpiPositionOption = { id: string; name: string; templateId: string | null; templateName: string | null };

export type KpiTemplateOverview = {
  templates: KpiTemplate[];
  positions: KpiPositionOption[];
  // Template bawaan yang belum ada di usaha ini (dihapus / usaha dibuat sebelum feature 18)
  missingBuiltinCount: number;
};

const indicatorSchema: z.ZodType<KpiIndicator> = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(KPI_INDICATOR_TYPES),
  unit: z.string().nullable(),
  target: z.string(),
  targetPeriod: z.enum(KPI_TARGET_PERIODS).nullable(),
  systemMetric: z.enum(KPI_SYSTEM_METRICS).nullable(),
  weight: z.number(),
});

// Validasi respons API di web
export const kpiTemplateSchema: z.ZodType<KpiTemplate> = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  builtin: z.boolean(),
  positions: z.array(z.object({ id: z.string(), name: z.string() })),
  indicators: z.array(indicatorSchema),
  updatedAt: z.string(),
});

export const kpiTemplateOverviewSchema: z.ZodType<KpiTemplateOverview> = z.object({
  templates: z.array(kpiTemplateSchema),
  positions: z.array(z.object({ id: z.string(), name: z.string(), templateId: z.string().nullable(), templateName: z.string().nullable() })),
  missingBuiltinCount: z.number(),
});
