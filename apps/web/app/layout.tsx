import type { Metadata } from "next";
import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

// Teks: DM Sans. Judul: Plus Jakarta Sans (kelas `font-display`)
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: "Exapay",
  description: "Payroll, absensi, dan KPI untuk UMKM",
};

type Props = {
  children: ReactNode;
};

export default function RootLayout({ children }: Props) {
  return (
    <html lang="id" className={`${dmSans.variable} ${jakarta.variable}`}>
      <body className="bg-background font-sans text-text-primary antialiased">{children}</body>
    </html>
  );
}
