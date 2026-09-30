import { invitationPreviewSchema } from "@exapay/shared";
import type { Metadata } from "next";

import { AcceptInvitationForm } from "@/components/auth/AcceptInvitationForm";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { AuthShell } from "@/components/auth/AuthShell";
import { BackToLoginLink } from "@/components/auth/BackToLoginLink";
import { FormAlert } from "@/components/common/FormAlert";
import { apiRequest } from "@/lib/api/server";

export const metadata: Metadata = { title: "Terima undangan — Exapay" };

type Props = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const result = await apiRequest("/invitations/lookup", (data) => invitationPreviewSchema.parse(data), { method: "POST", body: { token } });

  // 410 = tautan tidak valid / sudah dipakai → ditangani form (state "invalid"). Error lain = gangguan server.
  if (!result.ok && result.status !== 410) {
    return (
      <AuthShell footer={<BackToLoginLink />}>
        <AuthHeading title="Undangan tidak dapat dimuat" description="Silakan muat ulang halaman ini beberapa saat lagi." />
        <FormAlert tone="danger">{result.error}</FormAlert>
      </AuthShell>
    );
  }

  return (
    <AuthShell footer={<BackToLoginLink />}>
      <AcceptInvitationForm token={token} invitation={result.ok ? result.data : null} />
    </AuthShell>
  );
}
