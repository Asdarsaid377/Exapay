import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { type Database, departments, employees, memberships, positions, shiftRosterDays, tenants, users, withTenant, withUser } from "@exapay/db";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import type { Env } from "../src/config/env.js";
import { type EmailMessage, Mailer } from "../src/email/mailer.js";
import { RosterNoticeProcessor } from "../src/processors/roster-notice.processor.js";

// Verifikasi feature 46: email perubahan roster ke karyawan mode shift berisi jadwal 14 hari ke depan; karyawan ikut jadwal
// usaha / tanpa email dilewati; email akun portal terverifikasi diutamakan. Database: exapayroll_worker_test.

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
    testOwnerDatabaseUrl: string;
  }
}

let pool: pg.Pool;
let db: Database;

class FakeMailer extends Mailer {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

// Usaha Kota Makassar (WITA) + karyawan Dewi bertautan akun portal + Maya tanpa email
async function createTenant(name: string): Promise<{ tenantId: string; dewi: string; maya: string; email: string }> {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const email = `dewi-${randomUUID().slice(0, 8)}@test.exapay.local`;
  await withUser(db, userId, (tx) => tx.insert(users).values({ id: userId, email, fullName: "Dewi", emailVerifiedAt: new Date() }));
  return withTenant(db, { tenantId, userId }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, name, regencyCode: "73.71" });
    await tx.insert(memberships).values({ tenantId, userId, role: "karyawan" });
    const [department] = await tx.insert(departments).values({ tenantId, name: "Operasional" }).returning({ id: departments.id });
    const [position] = await tx.insert(positions).values({ tenantId, name: "Barista" }).returning({ id: positions.id });
    if (!department || !position) throw new Error("gagal membuat departemen/jabatan");
    const base = { tenantId, departmentId: department.id, positionId: position.id, joinDate: "2025-01-01", employmentStatus: "permanent" as const, ptkpStatus: "TK/0" as const };
    const dewi = randomUUID();
    const maya = randomUUID();
    await tx.insert(employees).values([
      { ...base, id: dewi, fullName: "Dewi Lestari", userId, email: "dewi.lama@contoh.local", scheduleMode: "shift" },
      { ...base, id: maya, fullName: "Maya Sari", scheduleMode: "shift" },
    ]);
    await tx.insert(shiftRosterDays).values([
      { tenantId, employeeId: dewi, workDate: "2026-10-05", shiftName: "Pagi", startTime: "07:00", endTime: "15:00" },
      { tenantId, employeeId: dewi, workDate: "2026-10-07", shiftName: "Malam", startTime: "22:00", endTime: "06:00" },
      { tenantId, employeeId: dewi, workDate: "2026-10-08" },
      // Sebelum hari ini — tidak dicantumkan
      { tenantId, employeeId: dewi, workDate: "2026-10-04", shiftName: "Pagi", startTime: "07:00", endTime: "15:00" },
    ]);
    return { tenantId, dewi, maya, email };
  });
}

function createProcessor(mailer: FakeMailer): RosterNoticeProcessor {
  return new RosterNoticeProcessor(db, mailer, new ConfigService<Env, true>({ APP_WEB_URL: "https://app.exapay.test" }));
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });
});

afterAll(async () => {
  await pool?.end();
});

describe("RosterNoticeProcessor.notify", () => {
  it("email jadwal 14 hari ke depan ke akun portal terverifikasi", async () => {
    const t = await createTenant("Kopi Roster");
    const mailer = new FakeMailer();
    // Senin 5 Okt 2026 09:00 WITA
    expect(await createProcessor(mailer).notify({ tenantId: t.tenantId, employeeId: t.dewi }, new Date("2026-10-05T01:00:00Z"))).toBe("sent");
    expect(mailer.sent).toHaveLength(1);
    const message = mailer.sent[0];
    expect(message?.to).toBe(t.email);
    expect(message?.subject).toBe("Jadwal shift Anda di Kopi Roster diperbarui");
    const lines = (message?.text ?? "").split("\n").filter((line) => line.startsWith("• "));
    expect(lines).toHaveLength(14);
    expect(lines.slice(0, 4)).toEqual([
      "• Sen 5 Okt — Pagi 07:00–15:00",
      "• Sel 6 Okt — belum diatur",
      "• Rab 7 Okt — Malam 22:00–06:00 (selesai besok)",
      "• Kam 8 Okt — Libur",
    ]);
    expect(message?.text).toContain("https://app.exapay.test/me");
  });

  it("dilewati: tanpa email, sudah ikut jadwal usaha", async () => {
    const t = await createTenant("Kopi Lewati");
    const mailer = new FakeMailer();
    const processor = createProcessor(mailer);
    expect(await processor.notify({ tenantId: t.tenantId, employeeId: t.maya })).toBe("skipped");
    await withTenant(db, { tenantId: t.tenantId, userId: null }, (tx) => tx.update(employees).set({ scheduleMode: "business" }).where(eq(employees.id, t.dewi)));
    expect(await processor.notify({ tenantId: t.tenantId, employeeId: t.dewi })).toBe("skipped");
    expect(mailer.sent).toEqual([]);
  });
});
