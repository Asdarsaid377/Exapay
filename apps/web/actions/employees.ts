"use server";

import {
  deactivateEmployeeSchema,
  EMPLOYEE_IMPORT_MAX_BYTES,
  employeeImportPreviewSchema,
  employeeImportResultSchema,
  type DeactivateEmployeeFormInput,
  type EmployeeFormInput,
  employeeInputSchema,
  revealedSensitiveSchema,
  revealSensitiveSchema,
  type SensitiveSection,
} from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { CreateEmployeeOutcome, EmployeeActionOutcome, ImportCommitOutcome, ImportPreviewOutcome, RevealOutcome } from "@/lib/employeeOutcomes";

// Server Action tipis /employees: validasi ulang → API /employees → revalidate. Peran & cakupan dicek di API.

const INVALID = { kind: "error", message: "Data tidak valid" } as const;
const ignoreData = (): null => null;
const createdSchema = z.object({ id: z.string() });

// body: objek (JSON) atau FormData (upload file)
async function send<T>(method: "POST" | "PUT", path: string, parse: (data: unknown) => T, body?: unknown) {
  const store = await cookies();
  return apiRequest(path, parse, { method, body, cookieHeader: sessionCookieHeader((name) => store.get(name)?.value) });
}

export async function createEmployee(input: EmployeeFormInput): Promise<CreateEmployeeOutcome> {
  const parsed = employeeInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await send("POST", "/employees", (data) => createdSchema.parse(data), parsed.data);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/employees");
  return { kind: "success", id: result.data.id };
}

export async function updateEmployee(id: string, input: EmployeeFormInput): Promise<EmployeeActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  const parsed = employeeInputSchema.safeParse(input);
  if (!parsedId.success) return INVALID;
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await send("PUT", `/employees/${parsedId.data}`, ignoreData, parsed.data);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/employees", "layout");
  return { kind: "success" };
}

export async function deactivateEmployee(id: string, input: DeactivateEmployeeFormInput): Promise<EmployeeActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  const parsed = deactivateEmployeeSchema.safeParse(input);
  if (!parsedId.success) return INVALID;
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const result = await send("POST", `/employees/${parsedId.data}/deactivate`, ignoreData, parsed.data);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/employees", "layout");
  return { kind: "success" };
}

export async function reactivateEmployee(id: string): Promise<EmployeeActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return INVALID;
  const result = await send("POST", `/employees/${parsedId.data}/reactivate`, ignoreData);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/employees", "layout");
  return { kind: "success" };
}

// Nilai penuh hanya dikembalikan ke component yang meminta — tidak di-cache, tidak di-revalidate
export async function revealSensitive(id: string, section: SensitiveSection): Promise<RevealOutcome> {
  const parsedId = z.uuid().safeParse(id);
  const parsed = revealSensitiveSchema.safeParse({ section });
  if (!parsedId.success || !parsed.success) return INVALID;
  const result = await send("POST", `/employees/${parsedId.data}/reveal`, (data) => revealedSensitiveSchema.parse(data), parsed.data);
  if (!result.ok) return { kind: "error", message: result.error };
  return { kind: "success", revealed: result.data };
}

// ——— Impor Excel (feature 12) ———

// File diperiksa ulang di sini (ukuran & ekstensi) sebelum diteruskan; isi file divalidasi di API
function importFile(formData: FormData): { ok: true; body: FormData } | { ok: false; message: string } {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Pilih file Excel (.xlsx) untuk diunggah" };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { ok: false, message: "Hanya file Excel .xlsx yang bisa diimpor" };
  if (file.size > EMPLOYEE_IMPORT_MAX_BYTES) return { ok: false, message: "File terlalu besar (maks. 1 MB)" };
  const body = new FormData();
  body.set("file", file, file.name);
  return { ok: true, body };
}

// Pratinjau: tidak menyimpan apa pun
export async function previewEmployeeImport(formData: FormData): Promise<ImportPreviewOutcome> {
  const file = importFile(formData);
  if (!file.ok) return { kind: "error", message: file.message };
  const result = await send("POST", "/employees/import/preview", (data) => employeeImportPreviewSchema.parse(data), file.body);
  if (!result.ok) return { kind: "error", message: result.error };
  return { kind: "success", preview: result.data };
}

// Simpan: file yang sama dikirim ulang, API memeriksa ulang lalu menyimpan baris valid dalam satu transaksi
export async function importEmployees(formData: FormData): Promise<ImportCommitOutcome> {
  const file = importFile(formData);
  if (!file.ok) return { kind: "error", message: file.message };
  const result = await send("POST", "/employees/import", (data) => employeeImportResultSchema.parse(data), file.body);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidatePath("/employees", "layout");
  return { kind: "success", result: result.data };
}
