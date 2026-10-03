import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { AnalyticsScript } from "@/components/landing/AnalyticsScript";

export const metadata: Metadata = { title: "Daftar — Exapay" };

// Dirender per request: env analitik (UMAMI_*) hanya ada saat runtime, bukan saat build image
export default async function SignupPage() {
  await connection();
  return (
    <>
      <AnalyticsScript />
      <AuthShell
        footer={
          <>
            Sudah punya akun?{" "}
            <Link href="/login" className="font-medium text-accent-strong underline-offset-4 hover:underline">
              Masuk
            </Link>
          </>
        }
      >
        <SignupForm />
      </AuthShell>
    </>
  );
}
