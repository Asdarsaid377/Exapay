"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";

import { logout } from "@/actions/auth";
import { BackdropShapes } from "@/components/layout/BackdropShapes";

// Dirender layout saat token masih terbaca proxy tetapi API menolak sesinya (mis. tenant dinonaktifkan).
// Logout lewat Server Action (POST) — BUKAN route GET: browser bisa mem-prefetch/prerender URL GET dari riwayat
// dan tanpa sengaja mengakhiri sesi yang masih berlaku.
export function SessionEnded() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // logout() menghapus cookie lalu redirect ke /login
    void logout();
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center px-3.5">
      <BackdropShapes variant="auth" />
      <p role="status" className="glass-strong flex items-center gap-2.5 rounded-card px-6 py-4 text-sm text-text-secondary">
        <LoaderCircle aria-hidden className="size-4.5 animate-spin text-accent-strong" />
        Sesi Anda berakhir. Mengarahkan ke halaman masuk…
      </p>
    </main>
  );
}
