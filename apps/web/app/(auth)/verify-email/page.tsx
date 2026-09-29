import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/AuthShell";
import { BackToLoginLink } from "@/components/auth/BackToLoginLink";
import { VerifyEmailStatus } from "@/components/auth/VerifyEmailStatus";

export const metadata: Metadata = { title: "Verifikasi email — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { token } = await searchParams;
  return (
    <AuthShell footer={<BackToLoginLink />}>
      <VerifyEmailStatus token={typeof token === "string" && token ? token : null} />
    </AuthShell>
  );
}
