import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/landing/LegalDocumentPage";
import { PRIVACY_POLICY } from "@/lib/legalContent";
import { legalMetadata } from "@/lib/legalMetadata";

export function generateMetadata(): Promise<Metadata> {
  return legalMetadata(PRIVACY_POLICY, "/privasi");
}

// Kebijakan privasi publik (sisa feature 43) — tautan footer landing
export default function PrivacyPage() {
  return <LegalDocumentPage document={PRIVACY_POLICY} related={{ label: "Syarat Layanan", href: "/syarat" }} />;
}
