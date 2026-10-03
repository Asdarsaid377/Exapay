import { type SetupGuide, setupGuideSchema } from "@exapay/shared";
import { cookies } from "next/headers";
import { cache } from "react";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Panduan setup awal (feature 48) — dipakai layout (item menu akun) & dashboard; satu permintaan per render (cache)
export const fetchSetupGuide = cache(async (): Promise<ApiResult<SetupGuide>> => {
  const store = await cookies();
  const cookieHeader = sessionCookieHeader((name) => store.get(name)?.value);
  return apiRequest("/setup-guide", (data) => setupGuideSchema.parse(data), { cookieHeader });
});
