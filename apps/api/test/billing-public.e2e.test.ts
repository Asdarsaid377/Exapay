import "reflect-metadata";

import { billingEstimateAmount, publicBillingPriceSchema, subscriptionDate } from "@exapay/shared";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { BillingService } from "../src/modules/billing/billing.service.js";

// Verifikasi feature 43: harga di landing page = harga platform berlaku di database (GET /billing/public/price tanpa login),
// ikut berganti saat versi harga baru mulai berlaku; kalkulator estimasi = rumus estimasi /settings/billing.

let app: INestApplication;
let server: Parameters<typeof request>[0];
let ownerPool: pg.Pool;
let ownerDb: NodePgDatabase;

type PriceRow = { price_per_employee: string; min_billed_employees: number; trial_days: number };

async function priceRowAt(date: string): Promise<PriceRow> {
  const result = await ownerDb.execute<PriceRow>(
    sql`SELECT price_per_employee, min_billed_employees, trial_days FROM billing_prices
        WHERE effective_from <= ${date} AND (effective_to IS NULL OR effective_to >= ${date})
        ORDER BY effective_from DESC LIMIT 1`,
  );
  const [row] = result.rows;
  if (!row) throw new Error(`tidak ada harga berlaku pada ${date}`);
  return row;
}

beforeAll(async () => {
  ownerPool = new pg.Pool({ connectionString: inject("testOwnerDatabaseUrl") });
  ownerDb = drizzle({ client: ownerPool });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  server = app.getHttpServer();
});

afterAll(async () => {
  // Kembalikan harga platform seperti seed migration (versi uji 2098 dihapus)
  await ownerDb?.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM billing_prices WHERE effective_from >= '2098-01-01'`);
    await tx.execute(sql`UPDATE billing_prices SET effective_to = NULL WHERE effective_from = '2024-01-01'`);
  });
  await app?.close();
  await ownerPool?.end();
});

describe("harga publik landing page", () => {
  it("tanpa login: harga berlaku hari ini sama dengan baris billing_prices", async () => {
    const res = await request(server).get("/billing/public/price");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const price = publicBillingPriceSchema.parse(res.body.data);
    const row = await priceRowAt(subscriptionDate(new Date()));
    expect(price).toEqual({
      priceDate: subscriptionDate(new Date()),
      pricePerEmployee: row.price_per_employee,
      minBilledEmployees: row.min_billed_employees,
      trialDays: row.trial_days,
    });
    // Respons hanya berisi harga platform — tanpa data usaha
    expect(Object.keys(res.body.data).sort()).toEqual(["minBilledEmployees", "priceDate", "pricePerEmployee", "trialDays"]);
  });

  it("versi harga baru → harga publik berganti mulai tanggal berlakunya", async () => {
    await ownerDb.transaction(async (tx) => {
      await tx.execute(sql`UPDATE billing_prices SET effective_to = '2097-12-31' WHERE effective_from = '2024-01-01'`);
      await tx.execute(
        sql`INSERT INTO billing_prices (price_per_employee, min_billed_employees, trial_days, grace_days, effective_from, note)
            VALUES (12500, 3, 14, 7, '2098-01-01', 'uji harga publik')`,
      );
    });
    const billing = app.get(BillingService);
    const before = await billing.publicPrice(new Date("2097-12-31T12:00:00+07:00"));
    const after = await billing.publicPrice(new Date("2098-01-01T00:30:00+07:00"));
    expect(before.pricePerEmployee).toBe((await priceRowAt("2097-12-31")).price_per_employee);
    expect(after).toEqual({ priceDate: "2098-01-01", pricePerEmployee: "12500.00", minBilledEmployees: 3, trialDays: 14 });
  });
});

describe("kalkulator estimasi", () => {
  it("max(karyawan, minimum) × harga, tepat tanpa float", () => {
    expect(billingEstimateAmount("10000.00", 5, 3)).toBe("50000.00");
    expect(billingEstimateAmount("10000.00", 5, 15)).toBe("150000.00");
    expect(billingEstimateAmount("10000.00", 5, 50)).toBe("500000.00");
    expect(billingEstimateAmount("12500", 3, 7)).toBe("87500.00");
    expect(billingEstimateAmount("0.1", 0, 3)).toBe("0.30");
    expect(billingEstimateAmount("9999999999999.99", 0, 50)).toBe("499999999999999.50");
  });
});
