import type { Metadata, Viewport } from "next";
import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";

import { ServiceWorkerRegistrar } from "@/components/common/ServiceWorkerRegistrar";
import { LANDING_MOTION_BOOTSTRAP } from "@/lib/landingMotion";

import "./globals.css";

// Teks: DM Sans. Judul: Plus Jakarta Sans (kelas `font-display`)
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: "Exapay",
  description: "Payroll, absensi, dan KPI untuk UMKM",
  // PWA (feature 37): manifest dari app/manifest.ts; iOS memakai apple-touch-icon & mode standalone
  applicationName: "Exapay",
  appleWebApp: { capable: true, title: "Exapay", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

// Warna bilah status/judul browser = token background
export const viewport: Viewport = { themeColor: "#fbf8f3" };

type Props = {
  children: ReactNode;
};

export default function RootLayout({ children }: Props) {
  return (
    // suppressHydrationWarning: skrip gerak landing menambah kelas exa-motion sebelum hidrasi (hanya atribut <html>).
    // data-scroll-behavior: Next mematikan gulir halus landing saat pindah halaman
    <html lang="id" className={`${dmSans.variable} ${jakarta.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANDING_MOTION_BOOTSTRAP }} />
      </head>
      <body className="bg-background font-sans text-text-primary antialiased">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
