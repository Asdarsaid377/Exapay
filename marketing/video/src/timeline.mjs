// Timeline bersama: dipakai scene (browser) untuk animasi dan render.mjs (Node) untuk menaruh efek suara.
// Semua waktu dalam detik. Musik diregangkan ke tepat 96 BPM → 1 ketukan = 0,625 s, 1 bar = 2,5 s,
// jadi setiap pergantian scene di video 15 detik jatuh tepat di awal bar.

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const BEAT = 0.625;

// Zona aman Story/Reels: 250 px atas & 340 px bawah tertutup UI Instagram
export const SAFE = { top: 250, bottom: 1580 };

// Musik M1 (lihat README): 97,47 BPM terukur (jarak snare 2-ketukan dari 0,7 s s.d. 44 s, residu ±20 ms),
// downbeat bar pertama di 0,116 s. atempo = 96 / 97,47 menggeser bar tepat ke kelipatan 2,5 s.
export const MUSIC = {
  file: "assets/audio/music/alex-morgan_acoustic-corporate-startup-promo-short-cut.mp3",
  start: 0.116,
  tempo: 96 / 97.47,
  volume: 0.5,
  fadeIn: 0.3,
  fadeOut: 0.8,
};

export const SFX = {
  pop: "assets/audio/sfx/pluck_002.ogg",
  whoosh: "assets/audio/sfx/maximize_006.ogg",
  tick: "assets/audio/sfx/tick_002.ogg",
  click: "assets/audio/sfx/click_002.ogg",
  success: "assets/audio/sfx/confirmation_002.ogg",
  notify: "assets/audio/sfx/confirmation_004.ogg",
  glass: "assets/audio/sfx/glass_002.ogg",
};

// Waktu kunci per scene, relatif terhadap awal scene. Varian "quick" untuk video 5 detik.
export const KEYS = {
  hook: { wordStart: 0.15, wordStep: BEAT / 2, pill: 3 * BEAT, wipe: [2.3, 2.8] },
  logo: { icon: [0.05, 0.6], word: [0.35, 0.85], headline: 0.75, lineStep: 0.12 },
  logoQuick: { icon: [0.0, 0.42], word: [0.15, 0.55] },
  payroll: { enter: [0, 0.55], count: [0.3, 1.35], final: 3 * BEAT },
  // Absen selfie: kamera tampil → tombol rana (1,5 ketukan) → kembali ke beranda dengan status masuk (ketukan 2)
  attendance: { enter: [0, 0.55], shutter: 1.5 * BEAT, done: 2 * BEAT },
  slip: { enter: [0, 0.55], lines: 0.3, lineStep: 0.07, toast: 2 * BEAT },
  leave: { enter: [0, 0.55], press: 2 * BEAT - 0.12, approve: 2 * BEAT },
  tasks: { enter: [0, 0.55], approve: [0.75, 1.0, 2 * BEAT] },
  ai: { enter: [0, 0.55], think: [0.3, 0.8], type: [0.8, 1.8], done: 3 * BEAT },
  compliance: { enter: [0, 0.55], rows: 0.3, rowStep: 0.12, toast: 2 * BEAT },
  portal: { enter: [0, 0.55], items: 0.3, itemStep: 0.1, sheet: 2 * BEAT, press: 3 * BEAT },
  kpi: { enter: [0, 0.55], score: [0.3, 1.15], bars: [0.3, 0.45, 0.6], barDur: 0.55, badge: 2 * BEAT },
  cta: { icon: 0.0, chips: [0.2, 0.32, 0.44], price: 0.5, button: BEAT, fine: 0.8, url: 2 * BEAT },
  ctaQuick: { icon: 0.0, chips: [0.08, 0.16, 0.24], price: 0.3, button: 0.32, fine: 0.4, url: 0.48 },
  exit: 0.25, // scene mulai keluar 0,25 s sebelum pergantian
};

export const VIDEOS = {
  story: {
    file: "exapay-story-15s.mp4",
    duration: 15,
    scenes: [
      { id: "hook", start: 0, dur: 2.5 },
      { id: "logo", start: 2.5, dur: 2.5 },
      { id: "payroll", start: 5, dur: 2.5 },
      { id: "attendance", start: 7.5, dur: 2.5 },
      { id: "kpi", start: 10, dur: 2.5 },
      { id: "cta", start: 12.5, dur: 2.5 },
    ],
  },
  // 30 detik: 12 bar × 2,5 s. Judul scene fitur bisa ditimpa per video (title/sub)
  long: {
    file: "exapay-story-30s.mp4",
    duration: 30,
    scenes: [
      { id: "hook", start: 0, dur: 2.5 },
      { id: "logo", start: 2.5, dur: 2.5 },
      { id: "payroll", start: 5, dur: 2.5, title: "Gaji dihitung otomatis", sub: "Lengkap dengan BPJS & PPh 21 TER" },
      { id: "slip", start: 7.5, dur: 2.5 },
      { id: "attendance", start: 10, dur: 2.5 },
      { id: "leave", start: 12.5, dur: 2.5 },
      { id: "tasks", start: 15, dur: 2.5 },
      { id: "kpi", start: 17.5, dur: 2.5, title: "Skor kinerja 0–100", sub: "Dihitung otomatis dari tugas yang terverifikasi" },
      { id: "ai", start: 20, dur: 2.5 },
      { id: "compliance", start: 22.5, dur: 2.5 },
      { id: "portal", start: 25, dur: 2.5 },
      { id: "cta", start: 27.5, dur: 2.5 },
    ],
  },
  // 42,5 detik: isi sama dengan versi 30 detik, tiap fitur 3,75 s (6 ketukan) agar sempat dibaca —
  // animasi tetap selesai ±1,9 s, sisanya layar diam. Pergantian scene tetap jatuh di ketukan.
  extended: {
    file: "exapay-story-42s.mp4",
    duration: 42.5,
    scenes: (() => {
      const F = 6 * BEAT; // 3,75 s
      const features = [
        { id: "payroll", title: "Gaji dihitung otomatis", sub: "Lengkap dengan BPJS & PPh 21 TER" },
        { id: "slip" },
        { id: "attendance" },
        { id: "leave" },
        { id: "tasks" },
        { id: "kpi", title: "Skor kinerja 0–100", sub: "Dihitung otomatis dari tugas yang terverifikasi" },
        { id: "ai" },
        { id: "compliance" },
        { id: "portal" },
      ];
      return [
        { id: "hook", start: 0, dur: 2.5 },
        { id: "logo", start: 2.5, dur: 2.5 },
        ...features.map((f, i) => ({ ...f, start: 5 + i * F, dur: F })),
        { id: "cta", start: 5 + features.length * F, dur: F },
      ];
    })(),
  },
  short: {
    file: "exapay-short-5s.mp4",
    duration: 5,
    scenes: [
      { id: "logo", start: 0, dur: 1.25, quick: true },
      { id: "payroll", start: 1.25, dur: 2.5 },
      { id: "cta", start: 3.75, dur: 1.25, quick: true },
    ],
  },
};

// Efek suara per scene (waktu relatif awal scene)
export function sceneCues(scene) {
  const k = KEYS;
  switch (scene.id) {
    case "hook":
      return [{ t: k.hook.pill, sfx: "pop", gain: 0.9 }];
    case "logo":
      return scene.quick ? [{ t: 0.02, sfx: "glass", gain: 0.8 }] : [{ t: 0, sfx: "whoosh", gain: 0.55 }];
    case "payroll":
      return [
        { t: k.payroll.count[1], sfx: "tick", gain: 1.4 },
        { t: k.payroll.final, sfx: "success", gain: 1.1 },
      ];
    case "attendance":
      return [
        { t: k.attendance.shutter, sfx: "click", gain: 1.5 },
        { t: k.attendance.done, sfx: "success", gain: 1.1 },
      ];
    case "slip":
      return [{ t: k.slip.toast, sfx: "notify", gain: 0.9 }];
    case "leave":
      return [
        { t: k.leave.press, sfx: "click", gain: 1.5 },
        { t: k.leave.approve, sfx: "success", gain: 1.1 },
      ];
    case "tasks":
      return k.tasks.approve.map((t) => ({ t, sfx: "tick", gain: 1.3 }));
    case "ai":
      return [
        { t: k.ai.think[0], sfx: "glass", gain: 0.7 },
        { t: k.ai.done, sfx: "success", gain: 1.0 },
      ];
    case "compliance":
      return [{ t: k.compliance.toast, sfx: "notify", gain: 0.9 }];
    case "portal":
      return [
        { t: k.portal.sheet, sfx: "pop", gain: 0.9 },
        { t: k.portal.press, sfx: "click", gain: 1.4 },
      ];
    case "kpi":
      return [
        ...k.kpi.bars.map((b) => ({ t: b + k.kpi.barDur, sfx: "tick", gain: 1.2 })),
        { t: k.kpi.badge + 0.02, sfx: "pop", gain: 0.9 },
      ];
    case "cta": {
      const c = scene.quick ? k.ctaQuick : k.cta;
      return [{ t: c.button, sfx: "notify", gain: 0.9 }];
    }
    default:
      return [];
  }
}

export function videoCues(video) {
  return video.scenes.flatMap((scene) => sceneCues(scene).map((cue) => ({ ...cue, t: scene.start + cue.t })));
}

// Teks yang bisa diganti lewat opsi CLI (--cta, --price, --price-prefix, --price-unit, --url, --fine)
export const DEFAULT_TEXT = {
  cta: "Coba gratis 30 hari",
  fine: "Tanpa kartu kredit · Data tetap milik Anda",
  pricePrefix: "Hanya",
  price: "Rp10.000",
  priceUnit: "per karyawan / bulan",
  url: "hr.solvexaerp.tech",
};
