"use server";

import { TASK_PHOTO_MAX_BYTES, taskLogInputSchema, taskLogSchema, taskLogUpdateSchema } from "@exapay/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { TaskLogActionOutcome } from "@/lib/taskLogOutcomes";

// Server Action tipis log tugas harian: validasi ulang → API → revalidate. Jendela tanggal, absen masuk, indikator
// template jabatan, dan jenis foto (dari isi file) diperiksa API.

const INVALID = { kind: "error", message: "Data tidak valid" } as const;
const ignoreData = (): null => null;
const PHOTO_TOO_LARGE = { kind: "error", message: "Foto terlalu besar (maks. 5 MB)" } as const;

async function send<T>(path: string, parse: (data: unknown) => T, method: "POST" | "PUT" | "DELETE", body?: unknown) {
  const store = await cookies();
  return apiRequest(path, parse, { method, body, cookieHeader: sessionCookieHeader((name) => store.get(name)?.value) });
}

function revalidate(): void {
  revalidatePath("/me/tasks");
  revalidatePath("/me");
}

// Foto opsional; jenis sebenarnya diperiksa API dari isi file
function photoOf(formData: FormData): File | null | "too-large" {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return null;
  return file.size > TASK_PHOTO_MAX_BYTES ? "too-large" : file;
}

function fieldsOf(formData: FormData): { indicatorId: FormDataEntryValue | null; quantity: FormDataEntryValue | null; note: FormDataEntryValue | null } {
  return { indicatorId: formData.get("indicatorId"), quantity: formData.get("quantity"), note: formData.get("note") };
}

// FormData: workDate, indicatorId (kosong = pekerjaan lain), quantity, note, photo (opsional)
export async function submitTaskLog(formData: FormData): Promise<TaskLogActionOutcome> {
  const parsed = taskLogInputSchema.safeParse({ workDate: formData.get("workDate"), ...fieldsOf(formData) });
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const photo = photoOf(formData);
  if (photo === "too-large") return PHOTO_TOO_LARGE;

  const body = new FormData();
  body.set("workDate", parsed.data.workDate);
  body.set("indicatorId", parsed.data.indicatorId ?? "");
  body.set("quantity", parsed.data.quantity ?? "");
  body.set("note", parsed.data.note ?? "");
  if (photo) body.set("photo", photo, photo.name);

  const result = await send("/tasks/me/logs", (data) => taskLogSchema.parse(data), "POST", body);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidate();
  return { kind: "success" };
}

// FormData: indicatorId, quantity, note, removePhoto ("true"), photo (pengganti, opsional)
export async function updateTaskLog(id: string, formData: FormData): Promise<TaskLogActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return INVALID;
  const parsed = taskLogUpdateSchema.safeParse({ ...fieldsOf(formData), removePhoto: formData.get("removePhoto") });
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const photo = photoOf(formData);
  if (photo === "too-large") return PHOTO_TOO_LARGE;

  const body = new FormData();
  body.set("indicatorId", parsed.data.indicatorId ?? "");
  body.set("quantity", parsed.data.quantity ?? "");
  body.set("note", parsed.data.note ?? "");
  body.set("removePhoto", parsed.data.removePhoto ? "true" : "false");
  if (photo) body.set("photo", photo, photo.name);

  const result = await send(`/tasks/me/logs/${parsedId.data}`, (data) => taskLogSchema.parse(data), "PUT", body);
  if (!result.ok) return { kind: "error", message: result.error };
  revalidate();
  return { kind: "success" };
}

export async function deleteTaskLog(id: string): Promise<TaskLogActionOutcome> {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return INVALID;
  const result = await send(`/tasks/me/logs/${parsedId.data}`, ignoreData, "DELETE");
  if (!result.ok) return { kind: "error", message: result.error };
  revalidate();
  return { kind: "success" };
}
