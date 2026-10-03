import type { MetadataRoute } from "next";

// PWA (feature 37): bisa dipasang di HP. start_url "/" → proxy mengarahkan sesuai peran (karyawan ke /me).
// Warna = token ui-tokens.md (background #fbf8f3, accent #f2790f). Ikon: "E" kapital putih (Plus Jakarta Sans 800) di atas oranye
// accent — permintaan user 2026-10-03; maskable dengan huruf lebih kecil (zona aman).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Exapay",
    short_name: "Exapay",
    description: "Absensi, tugas harian, KPI, dan slip gaji untuk UMKM",
    lang: "id",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf8f3",
    theme_color: "#fbf8f3",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
