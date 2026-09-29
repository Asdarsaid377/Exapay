import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/AuthShell";
import { BackToLoginLink } from "@/components/auth/BackToLoginLink";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Lupa password — Exapay" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell footer={<BackToLoginLink />}>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
