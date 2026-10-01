import { CloudOff, LogOut } from "lucide-react";
import type { Metadata } from "next";

import { logout } from "@/actions/auth";
import { ChangePasswordButton } from "@/components/auth/ChangePasswordButton";
import { buttonClassName } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { FormAlert } from "@/components/common/FormAlert";
import { ReadFields } from "@/components/common/ReadFields";
import { MyProfileView } from "@/components/employees/MyProfileView";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchMyProfile } from "@/lib/api/employees";
import { getSession } from "@/lib/auth/getSession";
import { todayIso } from "@/lib/datetime";
import { ROLE_LABELS } from "@/lib/roleLabels";

export const metadata: Metadata = { title: "Profil — Exapay" };

const DESCRIPTION = "Data kepegawaian Anda. Jika ada yang perlu diubah, hubungi admin usaha.";

// Profil portal karyawan (feature 37): data karyawan milik sendiri (hanya baca) + akun (ganti password, keluar).
// Tanpa referensi desain halaman ini — pola me.html + section baca detail karyawan (izin user). Tetap terbuka untuk
// karyawan nonaktif (bersama Slip).
export default async function MyProfilePage() {
  const [session, profile] = await Promise.all([getSession(), fetchMyProfile()]);

  return (
    <>
      <PageHeader title="Profil" description={DESCRIPTION} />
      {!profile.ok ? (
        <EmptyState icon={CloudOff} surface="solid" title="Profil tidak dapat dimuat" description={profile.error} />
      ) : profile.data.access === "not_linked" ? (
        <FormAlert tone="info">Akun Anda belum tertaut ke data karyawan, jadi data kepegawaian belum tersedia. Hubungi admin usaha.</FormAlert>
      ) : (
        <>
          {profile.data.access === "inactive" ? (
            <FormAlert tone="info">Data karyawan Anda tidak aktif. Anda masih bisa melihat profil dan mengunduh slip gaji.</FormAlert>
          ) : null}
          <MyProfileView employee={profile.data.employee} inactive={profile.data.access === "inactive"} today={todayIso()} />
        </>
      )}

      {session ? (
        <section className="surface-solid flex flex-col gap-4 rounded-card p-4.5">
          <h2 className="font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">Akun</h2>
          <ReadFields
            fields={[
              { label: "Email masuk", value: <span className="break-all">{session.user.email}</span>, wide: true },
              { label: "Usaha", value: session.activeTenant?.tenantName ?? "—" },
              { label: "Peran", value: session.activeTenant ? ROLE_LABELS[session.activeTenant.role] : "—" },
            ]}
          />
          <div className="flex flex-col gap-2.5">
            <ChangePasswordButton />
            <form action={logout}>
              <button type="submit" className={buttonClassName({ variant: "secondary", size: "lg", fullWidth: true, className: "text-danger-text" })}>
                <LogOut aria-hidden className="size-4.5" />
                Keluar
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </>
  );
}
