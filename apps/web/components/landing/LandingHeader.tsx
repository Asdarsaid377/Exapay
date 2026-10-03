"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ExapayLogo } from "@/components/auth/ExapayLogo";
import { buttonClassName } from "@/components/common/Button";
import { LANDING_ANCHORS } from "@/lib/landingContent";

type Props = {
  ctaLabel: string;
  // "/" di halaman selain landing (/privasi, /syarat) agar tautan bagian kembali ke landing
  anchorBase?: "" | "/";
};

// Header kaca sticky landing page (snapshot context/designs/landing.html). Mobile: tombol menu membuka sheet kaca
// berisi tautan anchor + Masuk + CTA; tutup via X / overlay / Escape / klik tautan.
export function LandingHeader({ ctaLabel, anchorBase = "" }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = (): void => setOpen(false);

  return (
    <>
      <header className="glass sticky top-3 z-30 mx-auto flex h-15 w-full max-w-landing items-center gap-1.5 rounded-[20px] pr-1.5 pl-3.5 lg:top-4 lg:h-17 lg:justify-between lg:rounded-card lg:pr-3 lg:pl-5">
        <Link href="/" aria-label="Exapay — beranda" className="flex-1 lg:flex-none">
          <ExapayLogo />
        </Link>
        <nav aria-label="Navigasi halaman" className="hidden gap-1 lg:flex">
          {LANDING_ANCHORS.map((anchor) => (
            <a
              key={anchor.href}
              href={`${anchorBase}${anchor.href}`}
              className="flex h-11 items-center rounded-full px-4 text-[15px] font-medium text-text-primary transition-colors hover:bg-control"
            >
              {anchor.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden h-11 items-center rounded-full px-4 text-[15px] font-bold text-text-primary transition-colors hover:bg-control lg:flex">
            Masuk
          </Link>
          <Link href="/signup" data-umami-event="cta-header" className={buttonClassName({ className: "h-11 px-4 text-sm lg:px-5 lg:text-[15px]" })}>
            Coba gratis
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Buka menu"
            aria-expanded={open}
            aria-controls="landing-menu"
            className="grid size-11 place-items-center rounded-field text-text-primary transition-colors hover:bg-glass-hover lg:hidden"
          >
            <Menu aria-hidden className="size-5.5" />
          </button>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div aria-hidden onClick={close} className="absolute inset-0 bg-inverse/32 transition-opacity duration-300 starting:opacity-0" />
          <div
            id="landing-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="glass-overlay absolute inset-x-2.5 top-2.5 flex flex-col gap-2 rounded-[26px] px-3 pt-3 pb-4 transition-[opacity,translate] duration-300 ease-exa-out starting:-translate-y-3 starting:opacity-0"
          >
            <div className="flex items-center justify-between pl-2.5">
              <ExapayLogo />
              <button
                type="button"
                onClick={close}
                aria-label="Tutup menu"
                className="grid size-11 place-items-center rounded-field text-text-primary transition-colors hover:bg-glass-hover"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <nav aria-label="Navigasi halaman" className="flex flex-col">
              {LANDING_ANCHORS.map((anchor) => (
                <a
                  key={anchor.href}
                  href={`${anchorBase}${anchor.href}`}
                  onClick={close}
                  className="flex min-h-13 items-center rounded-field px-3 font-display text-[17px] font-bold text-text-primary transition-colors hover:bg-control"
                >
                  {anchor.label}
                </a>
              ))}
            </nav>
            <div aria-hidden className="mx-3 my-1 h-px bg-border-subtle" />
            <div className="flex flex-col gap-2 p-1">
              <Link href="/login" className={buttonClassName({ variant: "secondary", size: "lg", fullWidth: true, className: "text-[15px]" })}>
                Masuk
              </Link>
              <Link href="/signup" data-umami-event="cta-menu" className={buttonClassName({ size: "lg", fullWidth: true, className: "text-[15px]" })}>
                {ctaLabel}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
