import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { siteUrl } from "@/lib/siteUrl";

// robots.txt (feature 43): area aplikasi (butuh login) & tautan bertoken tidak diindeks
export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const base = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/me",
        "/admin",
        "/employees",
        "/organization",
        "/attendance",
        "/kpi",
        "/payroll",
        "/compliance",
        "/settings",
        "/invite",
        "/payment",
        "/reset-password",
        "/verify-email",
      ],
    },
    sitemap: new URL("/sitemap.xml", base).toString(),
  };
}
