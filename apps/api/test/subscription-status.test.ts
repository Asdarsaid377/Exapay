import { subscriptionDaysUntil, subscriptionNoticeAt, subscriptionStateAt } from "@exapay/shared";
import { describe, expect, it } from "vitest";

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

describe("subscriptionDaysUntil & subscriptionNoticeAt (feature 40)", () => {
  // Hari kalender di zona platform (WIB): 23:30 WIB → 00:30 WIB besoknya = 1 hari, walau selisihnya 1 jam
  it("sisa hari dihitung per tanggal kalender WIB", () => {
    const end = new Date("2026-11-01T17:30:00.000Z"); // 2 Nov 00:30 WIB
    expect(subscriptionDaysUntil(end, new Date("2026-11-01T16:30:00.000Z"))).toBe(1); // 1 Nov 23:30 WIB
    expect(subscriptionDaysUntil(end, new Date("2026-11-01T17:00:00.000Z"))).toBe(0); // 2 Nov 00:00 WIB
    expect(subscriptionDaysUntil(end, new Date("2026-10-25T17:00:00.000Z"))).toBe(7);
  });

  it("tahap: > 7 hari tanpa pengingat; ≤ 7 / ≤ 3 / ≤ 1; tenggang; baca-saja; aktif & gratis tanpa pengingat", () => {
    const trial = { status: "trialing" as const, trialEndsAt: ENDS, currentPeriodEndsAt: null };
    const noticeAt = (offsetMs: number) => {
      const now = at(offsetMs);
      return subscriptionNoticeAt(subscriptionStateAt(trial, 7, now), now);
    };
    expect(noticeAt(-8 * DAY)).toBeNull();
    expect(noticeAt(-7 * DAY)).toBe("trial_h7");
    expect(noticeAt(-4 * DAY)).toBe("trial_h7");
    expect(noticeAt(-3 * DAY)).toBe("trial_h3");
    expect(noticeAt(-1 * DAY)).toBe("trial_h1");
    expect(noticeAt(-1)).toBe("trial_h1");
    expect(noticeAt(0)).toBe("grace_started");
    expect(noticeAt(7 * DAY)).toBe("read_only");

    const active = { status: "active" as const, trialEndsAt: null, currentPeriodEndsAt: ENDS };
    expect(subscriptionNoticeAt(subscriptionStateAt(active, 7, at(-DAY)), at(-DAY))).toBeNull();
    expect(subscriptionNoticeAt(subscriptionStateAt(active, 7, at(DAY)), at(DAY))).toBe("grace_started");
    const free = { status: "complimentary" as const, trialEndsAt: null, currentPeriodEndsAt: null };
    expect(subscriptionNoticeAt(subscriptionStateAt(free, 7, at(0)), at(0))).toBeNull();
  });
});
