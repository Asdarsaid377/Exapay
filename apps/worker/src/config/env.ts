import { z } from "zod";

// Env yang wajib ada agar worker bisa start. Tambah variabel di sini saat feature membutuhkannya.
export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    REDIS_URL: z.string().min(1),
    // Role runtime app_user (bukan owner tabel) — RLS berlaku; setiap job membuka withTenant dari tenant_id payload
    DATABASE_URL: z.string().min(1),
    // Kosong → provider AI palsu (dev/test tanpa biaya). Wajib di production.
    ANTHROPIC_API_KEY: z.string().optional().transform((value) => value?.trim() || undefined),
    // Model Claude untuk ringkasan kinerja (feature 23) — bisa diganti tanpa ubah kode
    AI_MODEL: z.string().min(1).default("claude-haiku-4-5"),
    // Storage S3-compatible (SeaweedFS) — PDF slip gaji (feature 31). Bucket dibuat API saat start.
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(3),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    // Email pemberitahuan slip gaji (feature 31) — sama dengan API (dev: Mailpit)
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().min(1),
    // URL publik web — tautan di email slip gaji & pengingat kepatuhan
    APP_WEB_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
    // Kalender kepatuhan (feature 33): jadwal pemindaian harian email H-7/H-1 (cron 5 kolom + zona waktu IANA)
    COMPLIANCE_CRON: z.string().trim().min(1).default("0 7 * * *"),
    COMPLIANCE_CRON_TZ: z.string().trim().min(1).default("Asia/Jakarta"),
    // Pengingat langganan (feature 40): pemindaian harian email trial H-7/H-3/H-1, tenggang, baca-saja
    BILLING_NOTICE_CRON: z.string().trim().min(1).default("0 7 * * *"),
    BILLING_NOTICE_CRON_TZ: z.string().trim().min(1).default("Asia/Jakarta"),
    // Selfie absen (feature 45): penghapusan harian foto > 90 hari (cron 5 kolom + zona waktu IANA; tanggal hari ini dari zona ini)
    SELFIE_RETENTION_CRON: z.string().trim().min(1).default("30 2 * * *"),
    SELFIE_RETENTION_CRON_TZ: z.string().trim().min(1).default("Asia/Jakarta"),
    // Pemilik platform yang diberi tahu saat owner menekan "Saya sudah bayar" (feature 41) — boleh lebih dari satu,
    // dipisah koma. Kosong di development → pemberitahuan dilewati (log warn); wajib di production.
    BILLING_NOTIFY_EMAIL: z
      .string()
      .optional()
      .transform((value) =>
        (value ?? "")
          .split(",")
          .map((email) => email.trim())
          .filter((email) => email.length > 0),
      )
      .pipe(z.array(z.email("BILLING_NOTIFY_EMAIL berisi alamat email yang tidak valid"))),
  })
  .refine((env) => env.NODE_ENV !== "production" || env.ANTHROPIC_API_KEY !== undefined, {
    path: ["ANTHROPIC_API_KEY"],
    message: "ANTHROPIC_API_KEY wajib diisi di production (provider AI palsu hanya untuk development)",
  })
  .refine((env) => env.NODE_ENV !== "production" || env.BILLING_NOTIFY_EMAIL.length > 0, {
    path: ["BILLING_NOTIFY_EMAIL"],
    message: "BILLING_NOTIFY_EMAIL wajib diisi di production (pemberitahuan pembayaran langganan)",
  });

export type Env = z.infer<typeof envSchema>;
