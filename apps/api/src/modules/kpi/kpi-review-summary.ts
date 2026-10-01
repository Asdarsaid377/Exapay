import { aiGenerations, kpiReviewSummaries, tenants } from "@exapay/db";
import {
  AI_GENERATION_STALE_MINUTES,
  type AiGenerationStatus,
  type KpiReviewCycle,
  type KpiReviewSummary,
  type KpiReviewSummarySnapshot,
  type KpiScoreResult,
  type KpiSummaryInput,
  type KpiSummarySource,
} from "@exapay/shared";
import { and, eq, gte, ne, sql } from "drizzle-orm";

import type { Transaction } from "../../database/tenant-transaction.js";
import type { AttendanceViewer } from "../attendance/attendance-viewer.js";

// Ringkasan AI penilaian KPI (feature 23) — bagian yang dipakai bersama KpiReviewsService (detail, finalisasi) dan
// KpiReviewSummariesService (generate, edit, tinjau).

// Versi narasi = mikrodetik epoch updated_at; "0" = belum ada baris narasi
export const summaryVersionOf = sql<string>`(extract(epoch from ${kpiReviewSummaries.updatedAt}) * 1000000)::bigint::text`;
export const NO_SUMMARY_VERSION = "0";

export type SummaryRecord = {
  body: string | null;
  source: KpiSummarySource | null;
  version: string;
  reviewedAt: Date | null;
  reviewedByName: string | null;
  generation: {
    id: string;
    status: AiGenerationStatus;
    error: string | null;
    requestedByName: string | null;
    model: string | null;
    promptVersion: string | null;
    createdAt: Date;
  } | null;
};

// Narasi + generasi terakhir satu penilaian. lock = kunci baris narasi (mutasi & finalisasi)
export async function loadSummary(tx: Transaction, reviewId: string, lock = false): Promise<SummaryRecord | null> {
  const query = tx
    .select({
      body: kpiReviewSummaries.body,
      source: kpiReviewSummaries.source,
      version: summaryVersionOf,
      reviewedAt: kpiReviewSummaries.reviewedAt,
      reviewedByName: kpiReviewSummaries.reviewedByName,
      generationId: aiGenerations.id,
      status: aiGenerations.status,
      error: aiGenerations.error,
      requestedByName: aiGenerations.requestedByName,
      model: aiGenerations.model,
      promptVersion: aiGenerations.promptVersion,
      createdAt: aiGenerations.createdAt,
    })
    .from(kpiReviewSummaries)
    .leftJoin(aiGenerations, eq(aiGenerations.id, kpiReviewSummaries.generationId))
    .where(eq(kpiReviewSummaries.reviewId, reviewId));
  const [row] = lock ? await query.for("update", { of: kpiReviewSummaries }) : await query;
  if (!row) return null;
  const { generationId, status, error, requestedByName, model, promptVersion, createdAt, ...summary } = row;
  return {
    ...summary,
    generation:
      generationId && status && createdAt ? { id: generationId, status, error, requestedByName, model, promptVersion, createdAt } : null,
  };
}

// Generasi queued/running yang belum macet (worker mati / job hilang dianggap macet setelah AI_GENERATION_STALE_MINUTES)
export function generationPending(generation: SummaryRecord["generation"], now: Date): boolean {
  if (!generation || (generation.status !== "queued" && generation.status !== "running")) return false;
  return now.getTime() - generation.createdAt.getTime() < AI_GENERATION_STALE_MINUTES * 60_000;
}

export type SummaryQuota = { used: number; limit: number; resetsOn: string };

// Kuota bulan berjalan (zona waktu usaha): generasi yang tidak gagal. today = tanggal lokal usaha (YYYY-MM-DD)
export async function summaryQuota(tx: Transaction, tenantId: string, today: string, timeZone: string): Promise<SummaryQuota> {
  const monthStart = `${today.slice(0, 7)}-01`;
  const [tenant] = await tx.select({ limit: tenants.aiSummaryMonthlyQuota }).from(tenants).where(eq(tenants.id, tenantId));
  const [usage] = await tx
    .select({ used: sql<number>`count(*)::int` })
    .from(aiGenerations)
    .where(and(ne(aiGenerations.status, "failed"), gte(aiGenerations.createdAt, sql`(${monthStart}::date::timestamp AT TIME ZONE ${timeZone})`)));
  return { used: usage?.used ?? 0, limit: tenant?.limit ?? 0, resetsOn: nextMonthStart(monthStart) };
}

function nextMonthStart(monthStart: string): string {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7));
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

export function summaryView(record: SummaryRecord | null, quota: SummaryQuota, now: Date): KpiReviewSummary {
  const generation = record?.generation ?? null;
  return {
    body: record?.body ?? null,
    source: record?.source ?? null,
    version: record?.version ?? NO_SUMMARY_VERSION,
    reviewedAt: record?.reviewedAt?.toISOString() ?? null,
    reviewedByName: record?.reviewedByName ?? null,
    generation: generation
      ? {
          status: generation.status,
          pending: generationPending(generation, now),
          error: generation.status === "failed" ? generation.error : null,
          requestedAt: generation.createdAt.toISOString(),
          requestedByName: generation.requestedByName,
          model: generation.model,
        }
      : null,
    quota,
  };
}

export function finalSummaryView(snapshot: KpiReviewSummarySnapshot | null | undefined): KpiReviewSummary {
  return {
    body: snapshot?.body ?? null,
    source: snapshot?.source ?? null,
    version: NO_SUMMARY_VERSION,
    reviewedAt: snapshot?.reviewedAt ?? null,
    reviewedByName: snapshot?.reviewedByName ?? null,
    generation: null,
    quota: null,
  };
}

// Narasi yang ikut dikunci saat final; null = tanpa narasi. Pemanggil sudah memastikan narasi (jika ada) sudah ditinjau.
export function summarySnapshotOf(record: SummaryRecord | null): KpiReviewSummarySnapshot | null {
  if (!record?.body || !record.source || !record.reviewedAt) return null;
  const aiMade = record.source !== "manual" && record.generation?.status === "succeeded";
  return {
    body: record.body,
    source: record.source,
    reviewedAt: record.reviewedAt.toISOString(),
    reviewedByName: record.reviewedByName,
    model: aiMade ? (record.generation?.model ?? null) : null,
    promptVersion: aiMade ? (record.generation?.promptVersion ?? null) : null,
  };
}

// Penilai narasi: draft → atasan langsung + owner/admin; direview → owner/admin (yang memfinalkan). Bukan penilaian sendiri.
export function canWriteSummary(viewer: AttendanceViewer, review: { status: string; employeeId: string }, hasTemplate: boolean): boolean {
  if (review.status === "final" || !hasTemplate || review.employeeId === viewer.ownEmployeeId) return false;
  return review.status === "draft" || (review.status === "reviewed" && viewer.manage);
}

// Input terstruktur untuk AI — TANPA nama/identitas karyawan (hanya jabatan, departemen, periode, angka)
export function buildSummaryInput(
  review: { cycle: KpiReviewCycle; startDate: string; endDate: string; positionName: string; departmentName: string },
  templateName: string,
  result: KpiScoreResult,
  pendingTaskLogs: number,
): KpiSummaryInput {
  return {
    period: { cycle: review.cycle, startDate: review.startDate, endDate: review.endDate },
    employee: { positionName: review.positionName, departmentName: review.departmentName },
    templateName,
    score: result.score,
    predicate: result.predicate,
    days: result.days,
    indicators: result.indicators.map(({ id: _id, ...indicator }) => indicator),
    pendingTaskLogs,
  };
}
