import { logout } from "@/actions/auth";
import { Button } from "@/components/common/Button";
import { BackdropShapes } from "@/components/layout/BackdropShapes";
import { getSession } from "@/lib/auth/getSession";
import { ROLE_LABELS } from "@/lib/roleLabels";

type Props = {
  area: string;
  // Feature yang akan menggantikan halaman sementara ini
  replacedBy: string;
};

// SEMENTARA (feature 04): tujuan redirect per peran sebelum halaman aslinya dibangun.
export async function SessionPlaceholder({ area, replacedBy }: Props) {
  const session = await getSession();

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <BackdropShapes variant="auth" />
      <section className="glass-strong flex w-full max-w-md flex-col gap-6 rounded-card p-6 sm:p-8">
        <header className="flex flex-col gap-1.5">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-text-primary">{area}</h1>
          <p className="text-sm text-text-secondary">Halaman sementara — dibangun lengkap di {replacedBy}.</p>
        </header>
        {session ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-text-tertiary">Nama</dt>
            <dd className="text-text-primary">{session.user.fullName}</dd>
            <dt className="text-text-tertiary">Email</dt>
            <dd className="text-text-primary">{session.user.email}</dd>
            <dt className="text-text-tertiary">Usaha aktif</dt>
            <dd className="text-text-primary">{session.activeTenant?.tenantName ?? "—"}</dd>
            <dt className="text-text-tertiary">Peran</dt>
            <dd className="text-text-primary">
              {session.activeTenant ? ROLE_LABELS[session.activeTenant.role] : session.user.isSuperAdmin ? "Super-admin" : "—"}
            </dd>
          </dl>
        ) : (
          <p className="text-sm text-text-secondary">Sesi tidak dapat dimuat.</p>
        )}
        <form action={logout}>
          <Button type="submit" variant="secondary" size="lg" fullWidth>
            Keluar
          </Button>
        </form>
      </section>
    </main>
  );
}
