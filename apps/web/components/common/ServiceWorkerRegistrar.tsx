"use client";

import { useEffect } from "react";

// Mendaftarkan service worker PWA (public/sw.js, feature 37). Hanya di secure context (HTTPS / localhost) — di luar itu
// browser tidak menyediakan navigator.serviceWorker. Gagal daftar tidak mengganggu aplikasi.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error: unknown) => {
      console.error("[pwa/register] service worker gagal didaftarkan", error);
    });
  }, []);
  return null;
}
