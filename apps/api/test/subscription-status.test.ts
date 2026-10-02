import { describe, expect, it } from "vitest";

import { subscriptionStateAt } from "../src/modules/billing/subscription-status.js";

// Verifikasi feature 39: status efektif langganan dihitung dari tanggal (tanpa cron).

const DAY = 24 * 60 * 60 * 1000;
const ENDS = new Date("2026-11-01T03:00:00.000Z");
const at = (offsetMs: number): Date => new Date(ENDS.getTime() + offsetMs);

describe("subscriptionStateAt", () => {
  it("trial: sebelum berakhir → trialing; dalam tenggang → past_due; setelah tenggang → read_only", () => {
    const row = { status: "trialing" as const, trialEndsAt: ENDS, currentPeriodEndsAt: null };
    expect(subscriptionStateAt(row, 7, at(-1))).toMatchObject({ status: "trialing", writable: true, endsAt: ENDS });
    expect(subscriptionStateAt(row, 7, at(0))).toMatchObject({ status: "past_due", writable: true });
    expect(subscriptionStateAt(row, 7, at(7 * DAY - 1))).toMatchObject({ status: "past_due", writable: true });
    const locked = subscriptionStateAt(row, 7, at(7 * DAY));
    expect(locked).toMatchObject({ status: "read_only", writable: false });
    expect(locked.graceEndsAt?.toISOString()).toBe("2026-11-08T03:00:00.000Z");
  });

  it("aktif memakai akhir periode berbayar, bukan akhir trial", () => {
    const row = { status: "active" as const, trialEndsAt: at(-60 * DAY), currentPeriodEndsAt: ENDS };
    expect(subscriptionStateAt(row, 7, at(-DAY))).toMatchObject({ status: "active", writable: true });
    expect(subscriptionStateAt(row, 7, at(DAY))).toMatchObject({ status: "past_due", writable: true });
    expect(subscriptionStateAt(row, 7, at(8 * DAY))).toMatchObject({ status: "read_only", writable: false });
  });

  it("tenggang 0 hari → langsung baca-saja saat berakhir", () => {
    const row = { status: "trialing" as const, trialEndsAt: ENDS, currentPeriodEndsAt: null };
    expect(subscriptionStateAt(row, 0, at(0))).toMatchObject({ status: "read_only", writable: false });
  });

  it("gratis (complimentary) tidak pernah terkunci", () => {
    const row = { status: "complimentary" as const, trialEndsAt: null, currentPeriodEndsAt: null };
    expect(subscriptionStateAt(row, 7, at(10_000 * DAY))).toEqual({ status: "complimentary", endsAt: null, graceEndsAt: null, writable: true });
  });

  it("data rusak (tanpa tanggal akhir) → gagal aman: baca-saja", () => {
    const row = { status: "trialing" as const, trialEndsAt: null, currentPeriodEndsAt: null };
    expect(subscriptionStateAt(row, 7, ENDS)).toMatchObject({ status: "read_only", writable: false });
  });
});
