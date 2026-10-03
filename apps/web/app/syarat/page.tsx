import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/landing/LegalDocumentPage";
import { TERMS_OF_SERVICE } from "@/lib/legalContent";
import { legalMetadata } from "@/lib/legalMetadata";

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata(TERMS_OF_SERVICE, "/syarat");
}

// Syarat layanan publik (sisa feature 43) — tautan footer landing
export default function TermsPage() {
  return <LegalDocumentPage document={TERMS_OF_SERVICE} related={{ label: "Kebijakan Privasi", href: "/privasi" }} />;
}
