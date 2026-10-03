"use client";

import { useEffect } from "react";

type MotionWindow = Window & { __exaReveal?: boolean };

// Langkah jeda untuk elemen yang masuk layar bersamaan (maks. 5 langkah agar tidak menunggu lama)
const STAGGER_MS = 90;
const STAGGER_MAX = 4;

// Gerak muncul-saat-scroll landing & halaman legal (permintaan user 2026-10-03; kelas html.exa-motion dari lib/landingMotion.ts).
// Menandai .exa-reveal yang masuk layar dengan .is-revealed (transisi naik + memudar di globals.css), sekali saja per elemen.
// Elemen yang masuk bersamaan diberi jeda bertahap, urut dari atas ke bawah lalu kiri ke kanan.
export function RevealOnScroll() {
  useEffect(() => {
    (window as MotionWindow).__exaReveal = true;
    const elements = Array.from(document.querySelectorAll<HTMLElement>(".exa-reveal:not(.is-revealed)"));
    if (!("IntersectionObserver" in window)) {
      for (const element of elements) element.classList.add("is-revealed");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entering = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
        entering.forEach((entry, index) => {
          const element = entry.target;
          if (!(element instanceof HTMLElement)) return;
          element.style.setProperty("--reveal-delay", `${Math.min(index, STAGGER_MAX) * STAGGER_MS}ms`);
          element.classList.add("is-revealed");
          observer.unobserve(element);
        });
      },
      // Mulai sedikit setelah tepi bawah layar agar gerak terlihat, bukan terjadi di luar pandangan
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return null;
}
