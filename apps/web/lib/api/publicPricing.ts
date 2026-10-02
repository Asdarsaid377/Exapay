import { type PublicBillingPrice, publicBillingPriceSchema } from "@exapay/shared";

import { type ApiResult, apiRequest } from "@/lib/api/server";

// Harga platform berlaku untuk landing page publik (feature 43) — tanpa cookie sesi. Di-cache 5 menit agar setiap
// kunjungan tamu tidak memanggil API; perubahan harga oleh super-admin terlihat paling lambat 5 menit kemudian.
const PRICE_REVALIDATE_SECONDS = 300;

export async function fetchPublicPrice(): Promise<ApiResult<PublicBillingPrice>> {
  return apiRequest("/billing/public/price", (data) => publicBillingPriceSchema.parse(data), { revalidateSeconds: PRICE_REVALIDATE_SECONDS });
}
