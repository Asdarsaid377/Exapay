import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { attendanceRecords, type Database, departments, employees, positions, tenants, withTenant } from "@exapay/db";
import { ConfigService } from "@nestjs/config";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import type { Env } from "../src/config/env.js";
import { AttendanceSelfieProcessor, selfieRetentionCutoff } from "../src/processors/attendance-selfie.processor.js";
import { FileStorage } from "../src/storage/file-storage.js";

// Verifikasi feature 45: selfie absen > 90 hari dihapus worker — file di storage dihapus, key dikosongkan (jenis foto
// tetap = "sudah dihapus"), selfie yang masih baru tidak tersentuh, hanya usaha yang dimaksud (RLS), idempoten, dan
// storage gagal → key tetap untuk dicoba ulang. Database: globalSetup API (vitest.config.ts) exapayroll_worker_test.

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
    testOwnerDatabaseUrl: string;
  }
}

let pool: pg.Pool;
let db: Database;

class FakeStorage extends FileStorage {
  readonly removed: string[] = [];
  failing = false;
  async put(): Promise<void> {}
  async remove(key: string): Promise<void> {
    if (this.failing) throw new Error("storage mati");
    this.removed.push(key);
  }
}

type Fixture = { tenantId: string; old: string; recent: string; plain: string };

// Tiga absen: lama dengan selfie masuk+pulang, baru dengan selfie, lama tanpa selfie
async function createTenant(name: string): Promise<Fixture> {
  const tenantId = randomUUID();
  return withTenant(db, { tenantId, userId: null }, async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, name });
    const [department] = await tx.insert(departments).values({ tenantId, name: "Operasional" }).returning({ id: departments.id });
    const [position] = await tx.insert(positions).values({ tenantId, name: "Barista" }).returning({ id: positions.id });
    if (!department || !position) throw new Error("gagal membuat departemen/jabatan");
    const employeeId = randomUUID();
    await tx.insert(employees).values({
      id: employeeId,
      tenantId,
      fullName: `Dewi ${name}`,
      departmentId: department.id,
      positionId: position.id,
      joinDate: "2025-01-01",
      employmentStatus: "permanent",
      ptkpStatus: "TK/0",
    });
    const ids = { old: randomUUID(), recent: randomUUID(), plain: randomUUID() };
    const key = (id: string, event: string): string => `tenants/${tenantId}/attendance-selfies/${id}/${event}-${randomUUID()}.jpg`;
    const base = { tenantId, employeeId, timeZone: "Asia/Makassar", scheduledStart: "08:00", scheduledEnd: "17:00" };
    await tx.insert(attendanceRecords).values([
      {
        ...base,
        id: ids.old,
        workDate: "2026-07-03",
        checkInAt: new Date("2026-07-03T00:00:00Z"),
        checkOutAt: new Date("2026-07-03T09:00:00Z"),
        checkInSelfieKey: key(ids.old, "check_in"),
        checkInSelfieType: "image/jpeg",
        checkOutSelfieKey: key(ids.old, "check_out"),
        checkOutSelfieType: "image/webp",
      },
      // Tepat di batas: masih disimpan
      { ...base, id: ids.recent, workDate: "2026-07-04", checkInAt: new Date("2026-07-04T00:00:00Z"), checkInSelfieKey: key(ids.recent, "check_in"), checkInSelfieType: "image/jpeg" },
      { ...base, id: ids.plain, workDate: "2026-06-01", checkInAt: new Date("2026-06-01T00:00:00Z") },
    ]);
    return { tenantId, ...ids };
  });
}

async function selfiesOf(tenantId: string) {
  return withTenant(db, { tenantId, userId: null }, (tx) =>
    tx
      .select({
        workDate: attendanceRecords.workDate,
        inKey: attendanceRecords.checkInSelfieKey,
        inType: attendanceRecords.checkInSelfieType,
        outKey: attendanceRecords.checkOutSelfieKey,
        outType: attendanceRecords.checkOutSelfieType,
      })
      .from(attendanceRecords)
      .orderBy(asc(attendanceRecords.workDate)),
  );
}

function createProcessor(storage: FakeStorage): AttendanceSelfieProcessor {
  return new AttendanceSelfieProcessor(db, storage, new ConfigService<Env, true>({}));
}

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });
});

afterAll(async () => {
  await pool?.end();
});

describe("selfieRetentionCutoff", () => {
  it("disimpan 90 hari: absen dengan tanggal kerja sebelum hari ini − 90 hari dihapus", () => {
    expect(selfieRetentionCutoff("2026-10-02")).toBe("2026-07-04");
    expect(selfieRetentionCutoff("2027-03-01")).toBe("2026-12-01");
  });
});

describe("AttendanceSelfieProcessor", () => {
  it("menghapus file > 90 hari usaha itu saja, key dikosongkan, jenis tetap; idempoten", async () => {
    const a = await createTenant("Selfie Purge A");
    const b = await createTenant("Selfie Purge B");
    const storage = new FakeStorage();
    const processor = createProcessor(storage);
    const cutoff = selfieRetentionCutoff("2026-10-02");

    // Lintas tenant hanya id usaha yang punya selfie kedaluwarsa
    expect(await processor.expiredTenantIds(cutoff)).toEqual(expect.arrayContaining([a.tenantId, b.tenantId]));
    expect(await processor.expiredTenantIds("2026-07-01")).not.toContain(a.tenantId);

    const before = await selfiesOf(a.tenantId);
    expect(await processor.purge({ tenantId: a.tenantId, cutoff })).toBe(2);
    expect(storage.removed.sort()).toEqual([before[1]?.inKey, before[1]?.outKey].sort());

    expect(await selfiesOf(a.tenantId)).toEqual([
      { workDate: "2026-06-01", inKey: null, inType: null, outKey: null, outType: null },
      { workDate: "2026-07-03", inKey: null, inType: "image/jpeg", outKey: null, outType: "image/webp" },
      { workDate: "2026-07-04", inKey: before[2]?.inKey, inType: "image/jpeg", outKey: null, outType: null },
    ]);
    // Usaha lain tidak tersentuh
    expect((await selfiesOf(b.tenantId))[1]?.inKey).not.toBeNull();
    expect(await processor.expiredTenantIds(cutoff)).not.toContain(a.tenantId);

    // Dijalankan ulang → tidak ada yang dihapus lagi
    expect(await processor.purge({ tenantId: a.tenantId, cutoff })).toBe(0);
    expect(storage.removed).toHaveLength(2);
  });

  it("storage gagal → job gagal, key tetap untuk dicoba ulang", async () => {
    const c = await createTenant("Selfie Purge C");
    const storage = new FakeStorage();
    storage.failing = true;
    const processor = createProcessor(storage);
    const cutoff = selfieRetentionCutoff("2026-10-02");

    await expect(processor.purge({ tenantId: c.tenantId, cutoff })).rejects.toThrow("storage mati");
    expect((await selfiesOf(c.tenantId))[1]?.inKey).not.toBeNull();

    storage.failing = false;
    expect(await processor.purge({ tenantId: c.tenantId, cutoff })).toBe(2);
    expect((await selfiesOf(c.tenantId))[1]).toMatchObject({ inKey: null, outKey: null });
  });
});
