import { ACCESS_COOKIE } from "@exapay/shared";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSession } from "@/lib/auth/getSession";
import { readSessionClaims } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Masuk — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;

  // Proxy hanya membiarkan user yang sudah login sampai di sini jika belum memilih usaha
  const store = await cookies();
  const claims = readSessionClaims(store.get(ACCESS_COOKIE)?.value);
  const session = claims ? await getSession() : null;

  return (
    <AuthShell
      footer={
        <>
          Belum punya akun?{" "}
          <Link href="/signup" className="font-medium text-accent-strong underline-offset-4 hover:underline">
            Daftarkan usaha Anda
          </Link>
        </>
      }
    >
      <LoginForm initialTenants={session?.tenants} next={typeof next === "string" ? next : undefined} />
    </AuthShell>
  );
}
