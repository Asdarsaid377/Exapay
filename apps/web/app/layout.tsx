import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Exapay",
  description: "Payroll, absensi, dan KPI untuk UMKM",
};

type Props = {
  children: ReactNode;
};

export default function RootLayout({ children }: Props) {
  return (
    <html lang="id" className={inter.variable}>
      <body className="bg-background font-sans text-text-primary antialiased">{children}</body>
    </html>
  );
}
