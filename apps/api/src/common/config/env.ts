import { z } from "zod";

// Env yang wajib ada agar API bisa start. Tambah variabel di sini saat feature membutuhkannya.
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET minimal 32 karakter"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET minimal 32 karakter"),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;
