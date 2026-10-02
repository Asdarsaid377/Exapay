import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { siteUrl } from "@/lib/siteUrl";

// sitemap.xml (feature 43): hanya halaman publik yang layak diindeks — landing & pendaftaran
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = siteUrl();
  return [
    { url: new URL("/", base).toString(), changeFrequency: "weekly", priority: 1 },
    { url: new URL("/signup", base).toString(), changeFrequency: "monthly", priority: 0.6 },
    { url: new URL("/login", base).toString(), changeFrequency: "yearly", priority: 0.3 },
  ];
}
