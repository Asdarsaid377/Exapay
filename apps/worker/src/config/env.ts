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
    AI_MODEL: z.string().min(1).default("claude-opus-5"),
  })
  .refine((env) => env.NODE_ENV !== "production" || env.ANTHROPIC_API_KEY !== undefined, {
    path: ["ANTHROPIC_API_KEY"],
    message: "ANTHROPIC_API_KEY wajib diisi di production (provider AI palsu hanya untuk development)",
  });

export type Env = z.infer<typeof envSchema>;
