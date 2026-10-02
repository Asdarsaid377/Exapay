import { z } from "zod";

// Env yang wajib ada agar API bisa start. Tambah variabel di sini saat feature membutuhkannya.
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  // Jumlah proxy tepercaya di depan API (Express "trust proxy") — menentukan req.ip untuk rate limit auth.
  // 0 = IP koneksi langsung (dev). Production: 1 (Caddy → API, atau Caddy → web → API; keduanya meneruskan satu X-Forwarded-For).
  // Hanya aman jika port API TIDAK terbuka ke internet (X-Forwarded-For bisa dipalsukan).
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET minimal 32 karakter"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET minimal 32 karakter"),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().min(1),
  // URL publik web (Next.js) — dipakai untuk tautan di email (reset password, verifikasi, undangan)
  APP_WEB_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  // Kunci enkripsi kolom sensitif (NIK, NPWP, rekening): 32 byte acak, base64. Buat: `openssl rand -base64 32`.
  // JANGAN diganti setelah ada data — ciphertext lama tidak bisa dibaca lagi (rotasi kunci = migrasi data terpisah).
  // Storage S3-compatible (SeaweedFS self-hosted): lampiran izin, foto tugas, slip PDF. Bucket dibuat otomatis saat API start.
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  DATA_ENCRYPTION_KEY: z
    .string()
    .refine((value) => /^[A-Za-z0-9+/]+={0,2}$/.test(value) && Buffer.from(value, "base64").length === 32, "DATA_ENCRYPTION_KEY harus 32 byte dalam base64"),
});

export type Env = z.infer<typeof envSchema>;
