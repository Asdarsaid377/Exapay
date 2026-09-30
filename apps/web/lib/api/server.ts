import { ACCESS_COOKIE, type ApiErrorCode, type ApiResponse, REFRESH_COOKIE } from "@exapay/shared";

// Pemanggil API NestJS dari sisi server Next.js (Server Component, Server Action, proxy).
// Jangan diimport dari Client Component.

export type ApiResult<T> =
  | { ok: true; status: number; data: T; setCookies: string[] }
  | { ok: false; status: number; error: string; code?: ApiErrorCode; setCookies: string[] };

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  // Nilai header Cookie yang diteruskan ke API (sesi user)
  cookieHeader?: string;
};

const NETWORK_ERROR = "Tidak dapat terhubung ke server. Silakan coba lagi.";

function apiBaseUrl(): string {
  const url = process.env.API_INTERNAL_URL;
  if (!url) throw new Error("[web/api] API_INTERNAL_URL belum di-set");
  return url.replace(/\/+$/, "");
}

function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, "success") === "boolean";
}

// Validasi bentuk data diserahkan ke pemanggil lewat `parse` — respons API tidak dipercaya begitu saja
export async function apiRequest<T>(path: string, parse: (data: unknown) => T, options: RequestOptions = {}): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.cookieHeader ? { Cookie: options.cookieHeader } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  } catch (error: unknown) {
    console.error(`[web/api] ${path} gagal: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, status: 0, error: NETWORK_ERROR, setCookies: [] };
  }

  const setCookies = response.headers.getSetCookie();
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // Body bukan JSON (mis. proxy error) — ditangani di bawah
  }

  if (!isApiResponse(json)) {
    return { ok: false, status: response.status, error: NETWORK_ERROR, setCookies };
  }
  if (!json.success) {
    return { ok: false, status: response.status, error: json.error, code: json.code, setCookies };
  }
  try {
    return { ok: true, status: response.status, data: parse(json.data), setCookies };
  } catch (error: unknown) {
    console.error(`[web/api] ${path} respons tidak sesuai: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, status: response.status, error: NETWORK_ERROR, setCookies };
  }
}

// Header Cookie berisi hanya cookie sesi Exapay
export function sessionCookieHeader(read: (name: string) => string | undefined): string | undefined {
  const parts = [ACCESS_COOKIE, REFRESH_COOKIE].flatMap((name) => {
    const value = read(name);
    return value ? [`${name}=${encodeURIComponent(value)}`] : [];
  });
  return parts.length > 0 ? parts.join("; ") : undefined;
}
