// Skrip kecil di <head> root layout (dijalankan sebelum konten tergambar, sekali per muat halaman penuh): menyalakan
// html.exa-motion — elemen .exa-reveal landing disembunyikan menunggu masuk layar — hanya bila browser mendukung
// IntersectionObserver dan pengguna tidak memilih "kurangi gerakan". Pengaman: bila RevealOnScroll tidak jalan dalam
// 3 detik (bukan halaman landing, atau hidrasi gagal), kelas dilepas agar konten tidak pernah tersembunyi.
// Di root layout, bukan komponen landing: tag <script> di komponen tidak dijalankan saat navigasi di sisi klien.
export const LANDING_MOTION_BOOTSTRAP = `(function(){try{if(window.matchMedia("(prefers-reduced-motion: reduce)").matches||!("IntersectionObserver" in window))return;var d=document.documentElement;d.classList.add("exa-motion");setTimeout(function(){if(!window.__exaReveal)d.classList.remove("exa-motion")},3000)}catch(e){}})();`;
