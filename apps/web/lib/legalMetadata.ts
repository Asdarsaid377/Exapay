import type { Metadata } from "next";
import { connection } from "next/server";

import type { LegalDocument } from "@/lib/legalContent";
import { siteUrl } from "@/lib/siteUrl";

// Metadata halaman legal publik — domain dari env runtime (sama dengan landing, dirender per request)
export async function legalMetadata(document: LegalDocument, path: string): Promise<Metadata> {
  await connection();
  const title = `${document.title} — Exapay`;
  return {
    metadataBase: siteUrl(),
    title: { absolute: title },
    description: document.description,
    alternates: { canonical: path },
    openGraph: { type: "article", locale: "id_ID", url: path, siteName: "Exapay", title, description: document.description },
  };
}
