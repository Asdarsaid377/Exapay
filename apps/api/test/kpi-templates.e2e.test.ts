import "reflect-metadata";
import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { auditLogs, kpiIndicators, kpiTemplates, memberships, positions, tenants, users } from "@exapay/db";
import type { KpiTemplate, KpiTemplateInput, KpiTemplateOverview, MembershipRole } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hash } from "@node-rs/argon2";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { type Database, withTenant, withUser } from "../src/database/tenant-transaction.js";
import { seedTenantDefaults } from "../src/modules/tenants/tenant-defaults.js";

// Verifikasi feature 18 (API): template KPI per jabatan — bobot ≠ 100% ditolak; template bawaan tersedia di tenant baru.

const PASSWORD = "password-kpi-123";
const ROLES = ["owner", "admin", "atasan", "karyawan"] as const;

let app: INestApplication;
let server: Parameters<typeof request>[0];
let pool: pg.Pool;
let db: Database;

type Workspace = { tenantId: string; tokens: Record<MembershipRole, string>; positionIds: [string, string] };

// Usaha dibuat seperti signup/super-admin: termasuk seedTenantDefaults (template KPI bawaan)
async function createWorkspace(name: string): Promise<Workspace> {
  const tenantId = randomUUID();
  const passwordHash = await hash(PASSWORD);
  const emails: Record<MembershipRole, string> = { owner: "", admin: "", atasan: "", karyawan: "" };
  for (const role of ROLES) {
    const id = randomUUID();
    emails[role] = `${role}-${randomUUID().slice(0, 8)}@test.exapay.local`;
    await withUser(db, id, (tx) => tx.insert(users).values({ id, email: emails[role], fullName: `${role} ${name}`, passwordHash, emailVerifiedAt: new Date() }));
    await withTenant(db, { tenantId, userId: id }, async (tx) => {
      if (role === "owner") {
        await tx.insert(tenants).values({ id: tenantId, name });
        await seedTenantDefaults(tx, { tenantId, userId: id });
      }
      await tx.insert(memberships).values({ tenantId, userId: id, role });
    });
  }
  const positionIds = await withTenant(db, { tenantId, userId: null }, async (tx) => {
    const rows = await tx
      .insert(positions)
      .values([
        { tenantId, name: "Kasir Pagi" },
        { tenantId, name: "Kasir Malam" },
      ])
      .returning({ id: positions.id });
    const [first, second] = rows;
    if (!first || !second) throw new Error("gagal membuat jabatan");
    return [first.id, second.id] as [string, string];
  });
  const tokens: Record<MembershipRole, string> = { owner: "", admin: "", atasan: "", karyawan: "" };
  for (const role of ROLES) {
    const res = await request(server).post("/auth/login").send({ email: emails[role], password: PASSWORD, client: "mobile" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    tokens[role] = res.body.data.tokens.accessToken;
  }
  return { tenantId, tokens, positionIds };
}

async function overview(token: string): Promise<KpiTemplateOverview> {
  const res = await request(server).get("/kpi/templates").set("Authorization", `Bearer ${token}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data;
}

function post(token: string, body: object): request.Test {
  return request(server).post("/kpi/templates").set("Authorization", `Bearer ${token}`).send(body);
}

function put(token: string, id: string, body: object): request.Test {
  return request(server).put(`/kpi/templates/${id}`).set("Authorization", `Bearer ${token}`).send(body);
}

const BARISTA: KpiTemplateInput = {
  name: "Barista",
  description: "  Peracik kopi  ",
  positionIds: [],
  indicators: [
    { name: "Gelas terjual", type: "count", unit: "gelas", target: "120", targetPeriod: "daily", weight: 50 },
    { name: "Nilai penjualan", type: "numeric", unit: "Rp", target: "1500000.50", targetPeriod: "weekly", weight: 20 },
    { name: "Kehadiran", type: "system", systemMetric: "attendance_rate", target: "95", weight: 20 },
    { name: "Kebersihan bar", type: "rating", weight: 10 },
  ],
};

function find(data: KpiTemplateOverview, name: string): KpiTemplate {
  const template = data.templates.find((t) => t.name === name);
  if (!template) throw new Error(`template ${name} tidak ada`);
  return template;
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

describe("template KPI bawaan", () => {
  it("tersedia di usaha baru dengan total bobot 100%", async () => {
    const ws = await createWorkspace("Toko KPI Bawaan");
    const data = await overview(ws.tokens.owner);
    expect(data.templates.map((t) => t.name)).toEqual(["Admin Gudang", "Kasir", "Sales", "Staf Produksi"]);
    expect(data.missingBuiltinCount).toBe(0);
    for (const template of data.templates) {
      expect(template.builtin).toBe(true);
      expect(template.positions).toEqual([]);
      expect(template.indicators.reduce((sum, indicator) => sum + indicator.weight, 0), template.name).toBe(100);
    }
    const kasir = find(data, "Kasir");
    expect(kasir.indicators[0]).toMatchObject({ name: "Transaksi dilayani", type: "count", unit: "transaksi", target: "80", targetPeriod: "daily", weight: 35 });
    expect(kasir.indicators.find((i) => i.type === "rating")).toMatchObject({ target: "5", unit: null, targetPeriod: null });
    expect(kasir.indicators.find((i) => i.type === "system")).toMatchObject({ systemMetric: "attendance_rate", target: "95" });
    expect(data.positions.map((p) => p.name)).toEqual(["Kasir Malam", "Kasir Pagi"]);
  });

  it("bawaan yang dihapus bisa ditambahkan kembali, tanpa duplikat", async () => {
    const ws = await createWorkspace("Toko KPI Pulihkan");
    const token = ws.tokens.admin;
    const sales = find(await overview(token), "Sales");
    expect((await request(server).delete(`/kpi/templates/${sales.id}`).set("Authorization", `Bearer ${token}`)).status).toBe(200);
    expect((await overview(token)).missingBuiltinCount).toBe(1);

    const restored = await request(server).post("/kpi/templates/builtin").set("Authorization", `Bearer ${token}`);
    expect(restored.status).toBe(200);
    expect(restored.body.data).toEqual({ added: 1 });
    const again = await request(server).post("/kpi/templates/builtin").set("Authorization", `Bearer ${token}`);
    expect(again.body.data).toEqual({ added: 0 });
    const data = await overview(token);
    expect(data.missingBuiltinCount).toBe(0);
    expect(data.templates.filter((t) => t.name === "Sales")).toHaveLength(1);
  });
});

describe("akses", () => {
  it("hanya owner/admin", async () => {
    const ws = await createWorkspace("Toko KPI Akses");
    for (const role of ["atasan", "karyawan"] as const) {
      expect((await request(server).get("/kpi/templates").set("Authorization", `Bearer ${ws.tokens[role]}`)).status).toBe(403);
      expect((await post(ws.tokens[role], BARISTA)).status).toBe(403);
    }
    expect((await post(ws.tokens.admin, BARISTA)).status).toBe(201);
  });
});

describe("validasi", () => {
  it("total bobot ≠ 100% ditolak", async () => {
    const ws = await createWorkspace("Toko KPI Bobot");
    const under = await post(ws.tokens.owner, { ...BARISTA, indicators: BARISTA.indicators.slice(0, 3) });
    expect(under.status).toBe(400);
    expect(under.body.error).toBe("Total bobot harus 100% (sekarang 90%)");

    const over = await post(ws.tokens.owner, { ...BARISTA, indicators: [...BARISTA.indicators, { name: "Sikap", type: "rating", weight: 5 }] });
    expect(over.status).toBe(400);
    expect(over.body.error).toBe("Total bobot harus 100% (sekarang 105%)");

    const barista = await post(ws.tokens.owner, BARISTA);
    const update = await put(ws.tokens.owner, barista.body.data.id, { ...BARISTA, indicators: [{ ...BARISTA.indicators[0], weight: 99 }] });
    expect(update.status).toBe(400);
    expect(update.body.error).toBe("Total bobot harus 100% (sekarang 99%)");
    expect(find(await overview(ws.tokens.owner), "Barista").indicators).toHaveLength(4);
  });

  it("isian per tipe, nama indikator ganda, dan nama template ganda", async () => {
    const ws = await createWorkspace("Toko KPI Validasi");
    const token = ws.tokens.owner;
    const count = { name: "Gelas", type: "count", unit: "gelas", targetPeriod: "daily", weight: 100 };
    expect((await post(token, { ...BARISTA, indicators: [{ ...count, target: "1.5" }] })).body.error).toBe("Target berupa bilangan bulat");
    expect((await post(token, { ...BARISTA, indicators: [{ ...count, target: "0" }] })).body.error).toBe("Target harus lebih dari 0");
    expect((await post(token, { ...BARISTA, indicators: [{ ...count, target: "5", unit: " " }] })).body.error).toBe("Satuan wajib diisi");
    const system = { name: "Hadir", type: "system", systemMetric: "attendance_rate", weight: 100 };
    expect((await post(token, { ...BARISTA, indicators: [{ ...system, target: "101" }] })).body.error).toBe("Target maksimal 100%");
    expect((await post(token, { ...BARISTA, indicators: [{ ...system, weight: 50, target: "90" }, { ...system, name: "Hadir 2", weight: 50, target: "90" }] })).body.error).toBe(
      "Indikator otomatis yang sama sudah ada di template ini",
    );
    expect(
      (await post(token, { ...BARISTA, indicators: [{ ...count, target: "5", weight: 50 }, { ...count, name: "gelas", target: "5", weight: 50 }] })).body.error,
    ).toBe("Nama indikator sudah dipakai di template ini");
    expect((await post(token, { ...BARISTA, indicators: [] })).body.error).toBe("Tambahkan minimal satu indikator");

    // Rating: target selalu skala maksimum walau klien mengirim target lain
    const rated = await post(token, { ...BARISTA, name: "Rating", indicators: [{ name: "Sikap", type: "rating", weight: 100, target: "3", unit: "x" }] });
    expect(rated.status).toBe(201);
    expect(find(await overview(token), "Rating").indicators[0]).toMatchObject({ target: "5", unit: null });

    const duplicate = await post(token, { ...BARISTA, name: "kasir" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe("Template dengan nama ini sudah ada");
  });
});

describe("tambah, ubah, salin, hapus", () => {
  it("jabatan: satu template banyak jabatan, jabatan pindah template, lepas saat template dihapus", async () => {
    const ws = await createWorkspace("Toko KPI Jabatan");
    const token = ws.tokens.owner;
    const [pagi, malam] = ws.positionIds;
    const kasir = find(await overview(token), "Kasir");

    // Template bawaan Kasir dipasang ke dua jabatan
    const kasirInput = { name: kasir.name, description: kasir.description, positionIds: [pagi, malam], indicators: kasir.indicators };
    expect((await put(token, kasir.id, kasirInput)).status).toBe(200);
    let data = await overview(token);
    expect(find(data, "Kasir").positions.map((p) => p.name)).toEqual(["Kasir Malam", "Kasir Pagi"]);
    expect(data.positions.every((p) => p.templateId === kasir.id && p.templateName === "Kasir")).toBe(true);

    // Template baru mengambil Kasir Malam dari template Kasir
    const created = await post(token, { ...BARISTA, name: "Kasir Malam", positionIds: [malam] });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    data = await overview(token);
    expect(find(data, "Kasir").positions.map((p) => p.id)).toEqual([pagi]);
    expect(find(data, "Kasir Malam").positions.map((p) => p.id)).toEqual([malam]);
    expect(find(data, "Kasir Malam").description).toBe("Peracik kopi");

    // Hapus template → jabatannya tanpa template (bukan terhapus)
    expect((await request(server).delete(`/kpi/templates/${created.body.data.id}`).set("Authorization", `Bearer ${token}`)).status).toBe(200);
    data = await overview(token);
    expect(data.positions.find((p) => p.id === malam)).toMatchObject({ templateId: null, templateName: null });
    expect(data.templates.some((t) => t.name === "Kasir Malam")).toBe(false);
    const orphanIndicators = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx.select({ id: kpiIndicators.id }).from(kpiIndicators).where(eq(kpiIndicators.templateId, created.body.data.id)),
    );
    expect(orphanIndicators).toEqual([]);
    expect((await request(server).delete(`/kpi/templates/${created.body.data.id}`).set("Authorization", `Bearer ${token}`)).status).toBe(404);
  });

  it("ubah indikator: yang dipertahankan tetap id-nya, yang dihapus hilang, urutan mengikuti input + audit", async () => {
    const ws = await createWorkspace("Toko KPI Ubah");
    const token = ws.tokens.owner;
    const created = await post(token, BARISTA);
    const original = find(await overview(token), "Barista");
    const [gelas, penjualan, hadir] = original.indicators;
    if (!gelas || !penjualan || !hadir) throw new Error("indikator kurang");

    const res = await put(token, created.body.data.id, {
      name: "Barista Senior",
      description: null,
      positionIds: [],
      indicators: [
        { ...hadir, target: "90", weight: 30 },
        { name: "Menu baru dicoba", type: "count", unit: "menu", target: "2", targetPeriod: "monthly", weight: 20 },
        { ...gelas, weight: 50 },
      ],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const updated = find(await overview(token), "Barista Senior");
    expect(updated.description).toBeNull();
    expect(updated.indicators.map((i) => i.name)).toEqual(["Kehadiran", "Menu baru dicoba", "Gelas terjual"]);
    expect(updated.indicators[0]).toMatchObject({ id: hadir.id, target: "90", weight: 30 });
    expect(updated.indicators[2]?.id).toBe(gelas.id);
    expect(updated.indicators.some((i) => i.id === penjualan.id)).toBe(false);

    // Id indikator milik template lain ditolak
    const kasir = find(await overview(token), "Kasir");
    const foreign = await put(token, created.body.data.id, { ...BARISTA, indicators: [{ ...BARISTA.indicators[0], id: kasir.indicators[0]?.id, weight: 100 }] });
    expect(foreign.status).toBe(400);

    const audit = await withTenant(db, { tenantId: ws.tenantId, userId: null }, (tx) =>
      tx
        .select({ action: auditLogs.action, before: auditLogs.before, after: auditLogs.after })
        .from(auditLogs)
        .where(and(eq(auditLogs.entity, "kpi_template"), eq(auditLogs.entityId, created.body.data.id)))
        .orderBy(asc(auditLogs.createdAt)),
    );
    expect(audit.map((row) => row.action)).toEqual(["create", "update"]);
    expect(audit[1]?.before).toMatchObject({ name: "Barista" });
    expect(audit[1]?.after).toMatchObject({ name: "Barista Senior", indicators: [{ name: "Kehadiran" }, { name: "Menu baru dicoba" }, { name: "Gelas terjual" }] });
  });
});

describe("isolasi antar usaha", () => {
  it("template & jabatan usaha lain tidak bisa dibaca atau dipakai", async () => {
    const a = await createWorkspace("Toko KPI A");
    const b = await createWorkspace("Toko KPI B");
    const templateB = find(await overview(b.tokens.owner), "Sales");

    // Konteks A tidak melihat baris B walau difilter eksplisit
    const rows = await withTenant(db, { tenantId: a.tenantId, userId: null }, async (tx) => ({
      templates: await tx.select({ id: kpiTemplates.id }).from(kpiTemplates).where(eq(kpiTemplates.id, templateB.id)),
      indicators: await tx.select({ id: kpiIndicators.id }).from(kpiIndicators).where(eq(kpiIndicators.templateId, templateB.id)),
    }));
    expect(rows).toEqual({ templates: [], indicators: [] });

    expect((await put(a.tokens.owner, templateB.id, BARISTA)).status).toBe(404);
    expect((await request(server).delete(`/kpi/templates/${templateB.id}`).set("Authorization", `Bearer ${a.tokens.owner}`)).status).toBe(404);
    const foreignPosition = await post(a.tokens.owner, { ...BARISTA, positionIds: [b.positionIds[0]] });
    expect(foreignPosition.status).toBe(400);
    expect(find(await overview(b.tokens.owner), "Sales").indicators).toHaveLength(templateB.indicators.length);
  });
});
