// Parser header Set-Cookie dari API NestJS, agar web bisa meneruskannya ke browser
// (browser hanya berbicara dengan web; API tidak diakses langsung).

export type ParsedCookie = {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none" | undefined;
  path: string | undefined;
  // detik; 0 = hapus cookie
  maxAge: number | undefined;
};

export function parseSetCookie(header: string): ParsedCookie | null {
  const [pair, ...attributes] = header.split(";").map((part) => part.trim());
  const separator = pair?.indexOf("=") ?? -1;
  if (!pair || separator <= 0) return null;

  const cookie: ParsedCookie = {
    name: pair.slice(0, separator),
    value: decodeURIComponent(pair.slice(separator + 1)),
    httpOnly: false,
    secure: false,
    sameSite: undefined,
    path: undefined,
    maxAge: undefined,
  };

  for (const attribute of attributes) {
    const [rawKey, ...rest] = attribute.split("=");
    const key = rawKey?.toLowerCase();
    const value = rest.join("=");
    if (key === "httponly") cookie.httpOnly = true;
    else if (key === "secure") cookie.secure = true;
    else if (key === "path") cookie.path = value;
    else if (key === "max-age") cookie.maxAge = Number.parseInt(value, 10);
    else if (key === "samesite") {
      const lower = value.toLowerCase();
      cookie.sameSite = lower === "lax" || lower === "strict" || lower === "none" ? lower : undefined;
    } else if (key === "expires" && cookie.maxAge === undefined) {
      const expires = Date.parse(value);
      if (!Number.isNaN(expires)) cookie.maxAge = Math.max(0, Math.floor((expires - Date.now()) / 1000));
    }
  }
  return cookie;
}
