import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import * as schema from "@exapay/db";
import { users } from "@exapay/db";
import { PASSWORD_MIN_LENGTH } from "@exapay/shared";
import { hash } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { z } from "zod";

// Buat akun super-admin, atau jadikan akun yang sudah ada super-admin. Satu-satunya jalur resmi (flag
// is_super_admin hanya bisa diubah role app_owner — trigger guard_super_admin_flag).
//
//   SUPER_ADMIN_PASSWORD='...' pnpm --filter @exapay/api admin:create-super-admin -- --email admin@exapay.id --name "Nama"
//
// Password dari env (bukan argumen) agar tidak tersimpan di riwayat shell/daftar proses. Wajib untuk akun baru;
// untuk akun yang sudah ada password lama tetap dipakai kecuali env diisi.

const argsSchema = z.object({
  email: z.email("--email tidak valid").trim(),
  name: z.string().trim().min(2, "--name minimal 2 karakter").optional(),
});

async function main(): Promise<void> {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error("DATABASE_MIGRATION_URL belum di-set (role app_owner)");

  const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } });
  const parsed = argsSchema.safeParse(values);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "argumen tidak valid");
  const args = parsed.data;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (password !== undefined && password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`SUPER_ADMIN_PASSWORD minimal ${PASSWORD_MIN_LENGTH} karakter`);
  }
  const passwordHash = password ? await hash(password) : null;

  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle({ client: pool, schema });
  try {
    const { rows } = await db.execute<{ id: string }>(sql`select id from auth_find_user_by_email(${args.email})`);
    const existingId = rows[0]?.id;
    const userId = existingId ?? randomUUID();

    await db.transaction(async (tx) => {
      // RLS tetap berlaku untuk app_owner (FORCE): konteks user = baris yang ditulis
      await tx.execute(sql`select set_config('app.tenant_id', '', true), set_config('app.user_id', ${userId}, true)`);
      if (existingId) {
        await tx
          .update(users)
          .set({ isSuperAdmin: true, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`, ...(passwordHash ? { passwordHash } : {}) })
          .where(eq(users.id, userId));
        return;
      }
      if (!args.name) throw new Error("--name wajib untuk akun baru");
      if (!passwordHash) throw new Error("SUPER_ADMIN_PASSWORD wajib untuk akun baru");
      await tx.insert(users).values({ id: userId, email: args.email, fullName: args.name, passwordHash, isSuperAdmin: true, emailVerifiedAt: new Date() });
    });

    console.log(`[create-super-admin] ${existingId ? "akun lama dijadikan" : "akun baru dibuat sebagai"} super-admin: ${args.email}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("[create-super-admin] gagal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
