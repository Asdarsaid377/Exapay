import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/AuthShell";
import { BackToLoginLink } from "@/components/auth/BackToLoginLink";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = { title: "Buat password baru — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;
  return (
    <AuthShell footer={<BackToLoginLink />}>
      <ResetPasswordForm token={typeof token === "string" && token ? token : null} />
    </AuthShell>
  );
}
