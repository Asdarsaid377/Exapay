import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Daftar — Exapay" };

export default function SignupPage() {
  return (
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
  );
}
