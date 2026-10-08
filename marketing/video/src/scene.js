// Scene video (berjalan di Chrome headless). Tidak ada animasi CSS: setiap frame dihitung dari waktu t lewat
// window.__render(t), jadi render deterministik. Warna hanya dari token Tailwind (apps/web/app/globals.css).
// Mockup diambil dari komponen landing asli (mockups.tsx); layar yang belum punya mockup landing (kamera selfie,
// persetujuan cuti, verifikasi tugas, ringkasan AI) disusun ulang dari kelas komponen app aslinya
// (components/selfie/SelfieCamera, attendance/LeaveRequestTable, tasks/TaskVerificationRow, kpi/KpiReviewSummaryPanel).
import { BEAT, HEIGHT, KEYS, SAFE, VIDEOS, WIDTH } from "./timeline.mjs";

// ---------- easing & util ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const outCubic = (p) => 1 - (1 - p) ** 3;
const inCubic = (p) => p ** 3;
const inOutCubic = (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
const outBack = (p, s = 1.6) => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2;
const lerp = (a, b, p) => a + (b - a) * p;
const rupiah = (n) => Math.round(n).toLocaleString("id-ID");

function h(tag, cls = "", style = {}, children = []) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  Object.assign(el.style, style);
  for (const c of [].concat(children)) el.append(typeof c === "string" ? document.createTextNode(c) : c);
  return el;
}
function html(markup) {
  const wrap = document.createElement("div");
  wrap.innerHTML = markup;
  return wrap.firstElementChild;
}
function setT(el, { x = 0, y = 0, s = 1, r = 0, o = 1 } = {}) {
  el.style.transform = `translate(${x}px, ${y}px) scale(${s}) rotate(${r}deg)`;
  el.style.opacity = String(o);
}
// Elemen daun yang terlihat dengan teks tertentu
function byText(root, text) {
  return [...root.querySelectorAll("span, div")].filter(
    (e) => e.childElementCount === 0 && e.textContent.trim() === text && getComputedStyle(e).display !== "none",
  );
}
// Muncul naik + fade (out-cubic)
function rise(t, start, dur = 0.4, dist = 44) {
  const p = outCubic(prog(t, start, start + dur));
  return { y: (1 - p) * dist, o: p };
}
// Pop masuk (out-back) mulai detik `start`
function pop(t, start, dur = 0.4, from = 0.6) {
  const p = prog(t, start, start + dur);
  return { s: t < start ? from : lerp(from, 1, outBack(p)), o: clamp(p * 3) };
}
// Tekan tombol: mengecil sebentar di sekitar detik `at`
function pressScale(t, at) {
  return t < at - 0.08 || t > at + 0.16 ? 1 : 1 - 0.08 * Math.sin(Math.PI * prog(t, at - 0.08, at + 0.16));
}
const exitProgress = (def, lt, isLast) => (isLast ? 0 : inCubic(prog(lt, def.dur - KEYS.exit, def.dur + 0.1)));

// Badge (components/common/Badge.tsx): pill tint + teks gelap senada
const TONES = {
  warning: ["bg-warning-soft", "text-warning-text"],
  success: ["bg-success-soft", "text-success-text"],
  danger: ["bg-danger-soft", "text-danger-text"],
  accent: ["bg-accent-soft", "text-accent-deep"],
  info: ["bg-info-soft", "text-info-text"],
};
function badge(tone, text) {
  return h("span", `inline-flex h-6.5 shrink-0 items-center gap-1 rounded-full px-2.75 text-[12.5px] font-bold whitespace-nowrap ${TONES[tone].join(" ")}`, {}, text);
}
function setTone(el, tone) {
  for (const cls of Object.values(TONES).flat()) el.classList.remove(cls);
  el.classList.add(...TONES[tone]);
}
const BTN_PRIMARY = "flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-4.5 font-display text-sm font-bold text-on-accent";
const BTN_SECONDARY = "flex h-11 items-center justify-center gap-2 rounded-full border border-border-control bg-control px-4.5 font-display text-sm font-bold text-text-primary";
function icon(svg, cls) {
  const el = h("span", `inline-block shrink-0 ${cls}`);
  el.innerHTML = svg;
  return el;
}

// ---------- logo ----------
// Logo resmi (apps/web/public/exapaylogo.png, latar putih dibuang oleh logo.mjs): tiga lapis bertumpuk dengan ukuran
// sama — ikon sapuan orange, huruf é, tulisan "Exapay" — agar bisa dianimasikan terpisah.
function logoMark(logo, height, parts = ["swoosh", "letter", "word"]) {
  const width = (height * logo.width) / logo.height;
  const layers = {};
  for (const name of parts) {
    layers[name] = h("img", "absolute inset-0 size-full");
    layers[name].src = logo[name];
  }
  if (layers.letter) layers.letter.style.transformOrigin = "50% 62%";
  const el = h("div", "relative shrink-0", { width: `${width}px`, height: `${height}px` }, Object.values(layers));
  return { el, ...layers };
}
// Animasi masuk logo: huruf membesar (out-back), sapuan meluncur dari kanan atas, tulisan tersingkap kiri → kanan
function animateLogo(mark, lt, iconAt, wordAt) {
  const ip = prog(lt, iconAt[0], iconAt[1]);
  setT(mark.letter, { s: Math.max(0, outBack(ip)), o: clamp(ip * 4) });
  const sp = prog(lt, iconAt[0] + 0.18, iconAt[1] + 0.18);
  setT(mark.swoosh, { x: (1 - outCubic(sp)) * 90, y: (1 - outCubic(sp)) * -90, r: lerp(16, 0, outBack(sp)), o: clamp(sp * 3) });
  const wp = outCubic(prog(lt, wordAt[0], wordAt[1]));
  mark.word.style.clipPath = `inset(0 ${(1 - wp) * 100}% 0 0)`;
}

// ---------- komponen bersama ----------
function titleBlock(title, sub) {
  const titleEl = h("h2", "font-display text-[72px] leading-[1.06] font-extrabold tracking-[-0.03em] text-text-primary text-balance", {}, title);
  const subEl = h("p", "mt-5 text-[40px] leading-[1.3] font-medium text-text-secondary text-balance", {}, sub);
  const block = h("div", "absolute text-center", { left: "70px", right: "70px", top: `${SAFE.top + 40}px` }, [titleEl, subEl]);
  return {
    block,
    update(lt, exitP) {
      const a = rise(lt, 0.05);
      const b = rise(lt, 0.15);
      setT(titleEl, { y: a.y, o: a.o });
      setT(subEl, { y: b.y, o: b.o });
      setT(block, { x: -260 * exitP, o: 1 - exitP });
    },
  };
}

// Jendela browser sederhana untuk layar owner (desktop). `overlay` = lapisan di atas konten (mis. toast)
function browserWindow(content, width, overlay) {
  const dot = () => h("span", "size-2.5 rounded-full bg-border-control");
  return h("div", "relative overflow-hidden rounded-[18px] border border-border-subtle bg-background shadow-overlay", { width: `${width}px` }, [
    h("div", "flex h-9 items-center gap-3 border-b border-border-subtle bg-surface-solid px-3.5", {}, [
      h("div", "flex gap-1.5", {}, [dot(), dot(), dot()]),
      h("div", "flex h-6 flex-1 items-center justify-center rounded-full bg-fill-subtle text-[11px] font-medium text-text-tertiary", {}, "hr.solvexaerp.tech"),
      h("div", "w-10"),
    ]),
    h("div", "relative overflow-hidden p-4", {}, [
      h("div", "absolute -top-12 -right-14 size-52 rounded-full bg-shape-peach"),
      h("div", "absolute -bottom-16 -left-10 size-44 rounded-full bg-shape-apricot"),
      h("div", "relative", {}, [content]),
    ]),
    ...(overlay ? [overlay] : []),
  ]);
}

// Bingkai HP (sama dengan HP portal di HeroPreview): status bar + konten layar
function phoneFrame(screen, size = "h-124 w-59") {
  return h("div", `relative ${size} rounded-device bg-inverse p-2 shadow-drawer`, {}, [
    h("div", "relative flex h-full flex-col overflow-hidden rounded-[32px] bg-background", {}, [
      h("div", "absolute -top-22.5 -right-20 size-55 rounded-full bg-shape-peach"),
      h("div", "relative flex justify-between px-3 pt-3 text-[11.5px] font-bold", {}, [h("span", "", {}, "07.56"), h("span", "h-3 w-11.5 rounded-full bg-inverse"), h("span", "", {}, "100%")]),
      h("div", "relative flex min-h-0 flex-1 flex-col", {}, [screen]),
    ]),
  ]);
}

// Toast di bawah mockup: pill gelap dengan ikon
function toast(iconSvg, text) {
  const pill = h("div", "flex items-center gap-2.5 rounded-full bg-inverse px-4.5 py-3 text-[13.5px] font-bold whitespace-nowrap text-on-inverse shadow-overlay", {}, [
    icon(iconSvg, "size-4.5 text-accent"),
    text,
  ]);
  return { wrap: h("div", "absolute inset-x-0 bottom-5 flex justify-center", {}, [pill]), pill };
}
function animateToast(t, pill, at) {
  const p = prog(t, at, at + 0.4);
  setT(pill, { y: t < at ? 60 : (1 - outBack(p)) * 60, o: clamp(p * 3) });
}

// Bungkus mockup: luar = gerak (translate), dalam = skala tetap agar muat di kotak (dihitung setelah font siap)
function fitted(node, box) {
  const inner = h("div", "absolute top-0 left-0", { transformOrigin: "0 0" }, [node]);
  const outer = h("div", "absolute inset-0", {}, [inner]);
  return {
    outer,
    // minTop: batas atas dinamis (di bawah judul yang terukur)
    fit(minTop = 0) {
      box = { ...box, top: Math.max(box.top, minTop) };
      const w = node.offsetWidth;
      const hh = node.offsetHeight;
      const s = Math.min(box.w / w, (box.bottom - box.top) / hh);
      inner.style.transform = `translate(${(WIDTH - w * s) / 2}px, ${box.top + (box.bottom - box.top - hh * s) / 2}px) scale(${s})`;
    },
  };
}
const MOCKUP_BOX = { w: 900, top: 560, bottom: SAFE.bottom - 10 };
const PHONE_BOX = { ...MOCKUP_BOX, top: 540 };
const floatY = (t) => 7 * Math.sin((2 * Math.PI * t) / 2.5);

// Scene fitur: judul + sub di atas, mockup masuk dari bawah (desktop) atau kanan (HP), keluar ke kiri.
// Judul bisa ditimpa per video lewat def.title / def.sub (timeline.mjs)
function featureScene(def, isLast, { title, sub, node, box = MOCKUP_BOX, from = "bottom", mount, animate }) {
  const fit = fitted(node, box);
  const tb = titleBlock(def.title ?? title, def.sub ?? sub);
  const root = h("div", "absolute inset-0", {}, [tb.block, fit.outer]);
  return {
    root,
    afterMount() {
      mount?.();
      // Mockup mulai minimal 56 px di bawah sub-judul (judul 2 baris mendorong mockup turun)
      fit.fit(tb.block.offsetTop + tb.block.offsetHeight + 56);
    },
    update(lt, t) {
      const exitP = exitProgress(def, lt, isLast);
      tb.update(lt, exitP);
      const ep = outCubic(prog(lt, 0, 0.55));
      const x = (from === "right" ? (1 - ep) * 1000 : 0) - 1200 * exitP;
      const y = (from === "bottom" ? (1 - ep) * 1100 : 0) + floatY(t);
      setT(fit.outer, { x, y });
      animate?.(lt, t);
    },
  };
}

// ---------- scene pembuka ----------
function hookScene(def) {
  const k = KEYS.hook;
  const words = ["Masih", "hitung", "gaji", "pakai", "Excel?"];
  const wordEls = words.map((w, i) =>
    h("span", `inline-block mx-[14px] ${i === words.length - 1 ? "text-accent" : "text-on-inverse"}`, { willChange: "transform" }, w),
  );
  const pill = h(
    "div",
    "mx-auto mt-16 flex h-[112px] w-fit items-center rounded-full bg-accent px-14 font-display text-[50px] font-extrabold tracking-[-0.02em] text-on-accent",
    {},
    "Sekarang otomatis",
  );
  const content = h("div", "absolute inset-x-0 text-center", { top: "640px" }, [
    h("h1", "mx-auto max-w-[920px] font-display text-[112px] leading-[1.08] font-extrabold tracking-[-0.035em]", {}, wordEls),
    pill,
  ]);
  const layer = h("div", "absolute inset-0 bg-inverse", {}, [content]);
  return {
    layer,
    update(t) {
      const lt = t - def.start;
      wordEls.forEach((el, i) => {
        const p = outCubic(prog(lt, k.wordStart + i * k.wordStep, k.wordStart + i * k.wordStep + 0.42));
        setT(el, { y: (1 - p) * 70, o: p });
      });
      setT(pill, pop(lt, k.pill, 0.45));
      const wipe = inOutCubic(prog(lt, k.wipe[0], k.wipe[1]));
      layer.style.transform = `translateY(${-HEIGHT * wipe}px)`;
      layer.style.display = wipe >= 1 ? "none" : "";
    },
  };
}

function logoScene(def, logo, isLast) {
  const k = def.quick ? KEYS.logoQuick : KEYS.logo;
  const mark = logoMark(logo, def.quick ? 820 : 560);
  const lines = def.quick
    ? []
    : [
        h("span", "block", {}, "Gaji, absensi, dan"),
        h("span", "block", {}, "kinerja karyawan"),
        h("span", "block", {}, ["beres ", h("span", "text-accent-strong", {}, "tanpa Excel.")]),
      ];
  const headline = h("h1", "mt-14 text-center font-display text-[76px] leading-[1.1] font-extrabold tracking-[-0.035em] text-text-primary", {}, lines);
  const group = h("div", "absolute inset-x-0 flex flex-col items-center justify-center", { top: `${SAFE.top}px`, height: `${SAFE.bottom - SAFE.top}px` }, [
    mark.el,
    ...(def.quick ? [] : [headline]),
  ]);
  return {
    root: group,
    update(lt) {
      animateLogo(mark, lt, k.icon, k.word);
      lines.forEach((ln, i) => setT(ln, rise(lt, k.headline + i * k.lineStep, 0.45, 50)));
      const exitP = exitProgress(def, lt, isLast);
      setT(group, { y: -180 * exitP, o: 1 - exitP });
    },
  };
}

// ---------- scene fitur ----------
function payrollScene(def, mockups, isLast) {
  const k = KEYS.payroll;
  const card = html(mockups.hero).children[0];
  Object.assign(card.style, { position: "relative", inset: "auto", width: "368px" });
  card.lastElementChild.style.display = "none"; // tombol Review draf / Ekspor Excel — tidak muat di kanvas Story
  let total, status, note;
  return featureScene(def, isLast, {
    title: "Payroll & PPh 21 TER",
    sub: "BPJS & PPh 21 dihitung, slip PDF ke email",
    node: browserWindow(card, 400),
    mount() {
      total = byText(card, "48.215.400")[0];
      status = byText(card, "Draf")[0];
      note = byText(card, "15 karyawan · slip siap dikirim setelah final")[0];
    },
    animate(lt) {
      total.textContent = rupiah(48215400 * outCubic(prog(lt, k.count[0], k.count[1])));
      const isFinal = lt >= k.final;
      status.textContent = isFinal ? "Final" : "Draf";
      setTone(status, isFinal ? "success" : "warning");
      status.style.transformOrigin = "100% 50%";
      status.style.transform = `scale(${isFinal ? lerp(1.5, 1, outBack(prog(lt, k.final, k.final + 0.35))) : 1})`;
      note.textContent = isFinal ? "15 karyawan · slip PDF dikirim ke email" : "15 karyawan · slip siap dikirim setelah final";
    },
  });
}

function slipScene(def, mockups, isLast) {
  const k = KEYS.slip;
  const slip = html(mockups.slip);
  slip.style.width = "420px";
  const rows = [...slip.children];
  const excel = h("div", `${BTN_SECONDARY} mt-3 w-fit`, {}, [icon(mockups.icons.sheet, "size-4 text-success"), "Ekspor Excel untuk transfer bank"]);
  const sent = toast(mockups.icons.mail, "Slip terkirim ke email 15 karyawan");
  return featureScene(def, isLast, {
    title: "Slip gaji langsung ke email",
    sub: "Plus file Excel untuk transfer bank",
    node: browserWindow(h("div", "flex flex-col", {}, [slip, excel, h("div", "h-16")]), 452, sent.wrap),
    animate(lt) {
      rows.forEach((row, i) => setT(row, rise(lt, k.lines + i * k.lineStep, 0.35, 24)));
      setT(excel, rise(lt, k.lines + rows.length * k.lineStep, 0.35, 24));
      animateToast(lt, sent.pill, k.toast);
    },
  });
}

// Kamera selfie (SelfieCamera): layar gelap, jam server, pratinjau dengan oval panduan, tombol rana.
// Pratinjau berisi siluet netral — bukan foto/wajah orang.
function attendanceScene(def, mockups, isLast) {
  const k = KEYS.attendance;
  const phone = html(mockups.hero).children[2];
  Object.assign(phone.style, { position: "relative", inset: "auto" });
  const screen = phone.firstElementChild;
  const silhouette = h("div", "absolute inset-x-0 bottom-0 flex flex-col items-center", {}, [
    h("div", "size-[66px] rounded-full bg-photo-placeholder"),
    h("div", "mt-2 h-[64px] w-[150px] rounded-t-[75px] bg-photo-placeholder"),
  ]);
  const flash = h("div", "absolute inset-0 bg-on-camera", { opacity: "0" });
  const shutter = h("div", "mx-auto size-[54px] rounded-full border-[3px] border-on-camera p-1", {}, [h("span", "block size-full rounded-full bg-on-camera")]);
  const camera = h("div", "absolute inset-0 z-10 flex flex-col gap-2.5 bg-camera-bg px-3 pt-3 pb-4 text-on-camera", {}, [
    h("div", "grid grid-cols-[28px_1fr_28px] items-center", {}, [
      h("span", "grid size-7 place-items-center rounded-full bg-on-camera/12", {}, [icon(mockups.icons.x, "size-3.5")]),
      h("span", "text-center font-display text-[12.5px] font-bold", {}, "Absen masuk"),
    ]),
    h("div", "flex flex-col items-center", {}, [
      h("span", "font-display text-[30px] leading-none font-extrabold tracking-[-0.03em] tabular-nums", {}, "07.56"),
      h("span", "mt-0.5 text-[10.5px] text-on-camera-muted", {}, "WITA · jam server"),
    ]),
    h("div", "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[20px] bg-camera-preview", {}, [
      silhouette,
      h("div", "relative h-[150px] w-[116px] rounded-[50%] border-2 border-camera-guide"),
    ]),
    h("span", "text-center text-[11px] text-on-camera-muted", {}, "Pastikan wajah terlihat jelas"),
    shutter,
    flash,
  ]);
  screen.append(camera);
  let button, thumb;
  return featureScene(def, isLast, {
    title: "Absen dari HP, pakai selfie",
    sub: "Tanpa mesin absen, ada bukti fotonya",
    node: phone,
    box: PHONE_BOX,
    from: "right",
    mount() {
      button = phone.querySelector("span.bg-accent");
      button.innerHTML = "";
      setTone(button, "success");
      button.classList.remove("bg-accent", "text-on-accent");
      thumb = h("span", "relative size-6 overflow-hidden rounded-full bg-camera-preview", {}, [
        h("span", "absolute top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-photo-placeholder"),
        h("span", "absolute -bottom-1 left-1/2 h-3 w-5 -translate-x-1/2 rounded-t-full bg-photo-placeholder"),
      ]);
      button.append(icon(mockups.icons.circleCheck, "size-4.5"), h("span", "", {}, "Masuk 07.56"), thumb);
    },
    animate(lt) {
      setT(shutter, { s: pressScale(lt, k.shutter) });
      flash.style.opacity = String(lt < k.shutter ? 0 : 0.85 * (1 - prog(lt, k.shutter, k.shutter + 0.25)));
      const back = prog(lt, k.done - 0.1, k.done + 0.1);
      camera.style.opacity = String(1 - back);
      camera.style.display = back >= 1 ? "none" : "";
      setT(button, { s: lt < k.done ? 0.85 : lerp(0.85, 1, outBack(prog(lt, k.done, k.done + 0.4))) });
    },
  });
}

// Persetujuan izin/cuti (LeaveRequestTable / LeaveDecisionActions)
function leaveScene(def, mockups, isLast) {
  const k = KEYS.leave;
  const status = badge("warning", "Menunggu");
  const approve = h("span", BTN_PRIMARY, {}, "Setujui");
  const actions = h("div", "grid grid-cols-2 gap-2.5", {}, [h("span", BTN_SECONDARY, {}, "Tolak"), approve]);
  const done = h("div", "flex h-11 items-center justify-center gap-2 rounded-full bg-success-soft font-display text-sm font-bold text-success-text", { display: "none" }, [
    icon(mockups.icons.circleCheck, "size-4.5"),
    "Disetujui",
  ]);
  const person = (initials, name, role, right) =>
    h("div", "flex items-center gap-3", {}, [
      h("span", "grid size-10 shrink-0 place-items-center rounded-full bg-inverse text-[13px] font-bold text-on-inverse", {}, initials),
      h("div", "flex min-w-0 flex-1 flex-col", {}, [h("span", "text-[14.5px] font-bold", {}, name), h("span", "text-caption text-text-tertiary", {}, role)]),
      right,
    ]);
  const card = h("div", "surface-solid flex w-[420px] flex-col gap-4 rounded-card p-5", {}, [
    h("div", "flex flex-col gap-0.5", {}, [
      h("span", "font-display text-base font-bold", {}, "Pengajuan izin, sakit & cuti"),
      h("span", "text-[13px] text-text-secondary", {}, "Kopi Nusantara · Oktober 2026"),
    ]),
    h("div", "flex flex-col gap-3 border-t border-border-subtle pt-4", {}, [
      person("RW", "Rina Wulandari", "Kasir", status),
      h("div", "flex flex-col gap-0.5 rounded-inner bg-fill-subtle px-3.5 py-3", {}, [
        h("span", "text-[14.5px] font-bold", {}, "Cuti · Senin, 5 Okt 2026"),
        h("span", "text-small text-text-secondary", {}, "1 hari · acara keluarga"),
      ]),
      actions,
      done,
    ]),
    h("div", "flex flex-col gap-3 border-t border-border-subtle pt-4", {}, [
      person("AP", "Agus Pratama", "Barista", badge("success", "Disetujui")),
      h("span", "text-small text-text-secondary", {}, "Sakit · Rabu, 30 Sep 2026 · surat dokter terlampir"),
    ]),
  ]);
  return featureScene(def, isLast, {
    title: "Izin & cuti tanpa chat panjang",
    sub: "Karyawan ajukan dari HP, Anda setujui sekali klik",
    node: browserWindow(card, 452),
    animate(lt) {
      setT(approve, { s: pressScale(lt, k.press) });
      const ok = lt >= k.approve;
      actions.style.display = ok ? "none" : "";
      done.style.display = ok ? "" : "none";
      setT(done, pop(lt, k.approve, 0.4, 0.85));
      status.textContent = ok ? "Disetujui" : "Menunggu";
      setTone(status, ok ? "success" : "warning");
      status.style.transformOrigin = "100% 50%";
      status.style.transform = `scale(${ok ? lerp(1.4, 1, outBack(prog(lt, k.approve, k.approve + 0.35))) : 1})`;
    },
  });
}

// Verifikasi tugas harian (TaskVerificationRow): jam, tugas, realisasi, karyawan, status
function tasksScene(def, mockups, isLast) {
  const k = KEYS.tasks;
  const items = [
    { time: "08.05", title: "Cek stok biji kopi", qty: "Selesai", who: "Dimas Pratama · Kepala barista" },
    { time: "11.40", title: "Penjualan menu baru", qty: "12 cup", who: "Rina Wulandari · Kasir" },
    { time: "15.20", title: "Bersihkan mesin espresso", qty: "Selesai", who: "Agus Pratama · Barista" },
  ];
  const rows = items.map((it) => {
    const status = badge("warning", "Menunggu verifikasi");
    const row = h("div", "flex gap-3 border-t border-border-subtle px-1 py-3.5", {}, [
      h("span", "w-11 shrink-0 pt-0.5 font-display text-[15px] font-extrabold tabular-nums", {}, it.time),
      h("div", "flex min-w-0 flex-1 flex-col gap-0.5", {}, [
        h("span", "text-[14.5px] font-bold", {}, it.title),
        h("span", "font-display text-[15px] font-extrabold tabular-nums", {}, it.qty),
        h("span", "text-caption text-text-tertiary", {}, it.who),
      ]),
      h("div", "shrink-0", {}, [status]),
    ]);
    return { row, status };
  });
  const count = h("span", "text-[13px] text-text-secondary", {}, "Hari ini · 3 menunggu");
  const card = h("div", "surface-solid flex w-[440px] flex-col rounded-card px-5 pt-5 pb-2", {}, [
    h("div", "flex flex-col gap-0.5 pb-3", {}, [h("span", "font-display text-base font-bold", {}, "Verifikasi tugas harian"), count]),
    ...rows.map((r) => r.row),
  ]);
  return featureScene(def, isLast, {
    title: "Tugas harian tercatat",
    sub: "Anda verifikasi, langsung jadi skor kinerja",
    node: browserWindow(card, 472),
    animate(lt) {
      let pending = rows.length;
      rows.forEach(({ row, status }, i) => {
        const at = k.approve[i];
        const ok = lt >= at;
        if (ok) pending--;
        status.textContent = ok ? "Disetujui" : "Menunggu verifikasi";
        setTone(status, ok ? "success" : "warning");
        status.style.transformOrigin = "100% 50%";
        status.style.transform = `scale(${ok ? lerp(1.35, 1, outBack(prog(lt, at, at + 0.3))) : 1})`;
        // sorot baris yang sedang diverifikasi
        const glow = lt >= at - 0.15 && lt < at + 0.35 ? 1 : 0;
        row.classList.toggle("bg-row-hover", glow === 1);
      });
      count.textContent = pending ? `Hari ini · ${pending} menunggu` : "Hari ini · semua terverifikasi";
    },
  });
}

function kpiScene(def, mockups, isLast) {
  const k = KEYS.kpi;
  const card = html(mockups.kpi);
  card.style.width = "440px";
  card.lastElementChild.style.display = "none"; // kotak draf ringkasan AI punya scene sendiri (video 30 s)
  const targets = [100, 86, 64];
  let score, predicate, bars, pcts;
  return featureScene(def, isLast, {
    title: "Tugas harian jadi skor kinerja",
    sub: "Diverifikasi atasan, skor 0–100 dari rumus yang jelas",
    node: browserWindow(card, 472),
    mount() {
      score = byText(card, "86")[0];
      predicate = byText(card, "Baik")[0];
      bars = [...card.querySelectorAll("div[style*='width']")];
      pcts = targets.map((v) => byText(card, `${v}%`)[0]);
    },
    animate(lt) {
      score.textContent = String(Math.round(86 * outCubic(prog(lt, k.score[0], k.score[1]))));
      targets.forEach((v, i) => {
        const p = outCubic(prog(lt, k.bars[i], k.bars[i] + k.barDur));
        bars[i].style.width = `${v * p}%`;
        pcts[i].textContent = `${Math.round(v * p)}%`;
      });
      setT(predicate, pop(lt, k.badge, 0.4, 0.5));
    },
  });
}

// Ringkasan kinerja AI (KpiReviewSummaryPanel): AI menulis → teks muncul seperti diketik
function aiScene(def, mockups, isLast) {
  const k = KEYS.ai;
  const TEXT =
    "Penjualan menu baru melampaui target: 42 dari 40 cup. Checklist kebersihan kasir konsisten, 26 dari 30 hari. " +
    "Ketepatan waktu saji masih di bawah target pada jam ramai — fokus berikutnya.";
  const typed = h("span", "");
  const rest = h("span", "", { opacity: "0" });
  const body = h("p", "text-[14.5px] leading-[1.6] text-text-primary", {}, [typed, rest]);
  const skeleton = h("div", "absolute inset-0 flex flex-col gap-3 pt-1", {}, [
    h("div", "h-3.5 w-full rounded-full bg-text-primary/9"),
    h("div", "h-3.5 w-11/12 rounded-full bg-text-primary/7"),
    h("div", "h-3.5 w-4/5 rounded-full bg-text-primary/7"),
    h("p", "text-small text-text-secondary", {}, "AI sedang menulis ringkasan…"),
  ]);
  const ready = h("div", "flex items-center gap-2 text-small font-bold text-success-text", {}, [icon(mockups.icons.circleCheck, "size-4.5"), "Ringkasan siap dibaca"]);
  const aiBadge = h("span", `inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-full px-2.75 text-[12.5px] font-bold ${TONES.accent.join(" ")}`, {}, [
    icon(mockups.icons.sparkles, "size-3.5"),
    "Dibuat AI",
  ]);
  const card = h("div", "surface-solid flex w-[440px] flex-col gap-4 rounded-card p-5", {}, [
    h("div", "flex items-start justify-between gap-3", {}, [h("span", "font-display text-h2 font-bold", {}, "Ringkasan kinerja"), aiBadge]),
    h("div", "flex items-center justify-between gap-3 rounded-inner bg-fill-subtle px-3.5 py-3", {}, [
      h("div", "flex flex-col", {}, [h("span", "text-[14.5px] font-bold", {}, "Rina Wulandari · Kasir"), h("span", "text-caption text-text-tertiary", {}, "September 2026")]),
      h("div", "flex items-baseline gap-2", {}, [h("span", "font-display text-[30px] leading-none font-extrabold", {}, "86"), badge("accent", "Baik")]),
    ]),
    h("div", "relative", {}, [body, skeleton]),
    ready,
  ]);
  return featureScene(def, isLast, {
    title: "AI bantu Anda menilai kinerja",
    sub: "Ringkasan tiap karyawan ditulis otomatis",
    node: browserWindow(card, 472),
    animate(lt) {
      setT(aiBadge, pop(lt, k.think[0], 0.4, 0.7));
      const thinking = lt < k.type[0];
      skeleton.style.display = thinking ? "" : "none";
      skeleton.style.opacity = String(0.55 + 0.45 * Math.sin((2 * Math.PI * lt) / 0.6));
      const n = Math.round(TEXT.length * prog(lt, k.type[0], k.type[1]));
      typed.textContent = TEXT.slice(0, n);
      rest.textContent = TEXT.slice(n);
      setT(ready, rise(lt, k.done, 0.35, 16));
    },
  });
}

function complianceScene(def, mockups, isLast) {
  const k = KEYS.compliance;
  const card = html(mockups.compliance);
  card.style.width = "440px";
  const rows = [...card.children].slice(1); // anak pertama = judul "Pengingat kepatuhan"
  const firstDue = rows[0].querySelector("span.rounded-full:last-child") ?? rows[0].lastElementChild;
  const sent = toast(mockups.icons.mail, "Pengingat juga dikirim ke email Anda");
  return featureScene(def, isLast, {
    title: "Tidak lupa setor BPJS & PPh 21",
    sub: "Pengingat H-7 & H-1, termasuk kontrak habis",
    node: browserWindow(h("div", "flex flex-col", {}, [card, h("div", "h-16")]), 472, sent.wrap),
    animate(lt) {
      rows.forEach((row, i) => {
        const p = outCubic(prog(lt, k.rows + i * k.rowStep, k.rows + i * k.rowStep + 0.4));
        setT(row, { x: (1 - p) * 80, o: p });
      });
      // badge tenggat terdekat berdenyut tiap ketukan
      const beatP = (lt % BEAT) / BEAT;
      firstDue.style.transform = `scale(${lt > 0.8 ? lerp(1.15, 1, outCubic(beatP)) : 1})`;
      animateToast(lt, sent.pill, k.toast);
    },
  });
}

// Portal karyawan di HP + lembar "pasang di layar utama" (PWA)
function portalScene(def, mockups, logo, isLast) {
  const k = KEYS.portal;
  const portal = html(mockups.portal);
  const card = portal.firstElementChild;
  card.classList.remove("w-95", "px-5.5");
  card.classList.add("px-4");
  card.style.width = "auto";
  const items = [...card.children].slice(1);
  // HP lebih sempit dari kartu landing (380 px): label & nilai satu baris, tanpa chevron
  for (const it of items) {
    const [label, value, chevron] = it.children;
    label.classList.replace("text-[14.5px]", "text-[13px]");
    label.classList.add("whitespace-nowrap");
    value.classList.replace("text-[14.5px]", "text-[13px]");
    value.classList.add("whitespace-nowrap");
    chevron.style.display = "none";
  }
  const install = h("span", `${BTN_PRIMARY} h-10 w-full`, {}, "Pasang");
  const sheet = h("div", "absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 rounded-t-[22px] bg-surface-solid px-4 pt-4 pb-5 shadow-drawer", {}, [
    h("div", "flex items-center gap-3", {}, [
      logoMark(logo, 44, ["swoosh", "letter"]).el,
      h("div", "flex flex-col", {}, [h("span", "font-display text-[14px] font-bold", {}, "Pasang Exapay"), h("span", "text-[11.5px] text-text-secondary", {}, "Di layar utama HP, tanpa toko aplikasi")]),
    ]),
    install,
  ]);
  const screen = h("div", "relative flex h-full flex-col px-2 pt-3", {}, [
    h("div", "flex flex-col gap-px px-1.5 pb-2.5", {}, [
      h("span", "font-display text-[17px] font-extrabold tracking-[-0.02em]", {}, "Halo, Rina"),
      h("span", "text-xs text-text-secondary", {}, "Kopi Nusantara · Pettarani"),
    ]),
    portal,
    sheet,
  ]);
  return featureScene(def, isLast, {
    title: "Karyawan punya portal sendiri",
    sub: "Slip, skor & absensi di HP, tanpa unduh aplikasi",
    node: phoneFrame(screen, "h-[560px] w-[300px]"),
    box: PHONE_BOX,
    from: "right",
    animate(lt) {
      items.forEach((it, i) => setT(it, rise(lt, k.items + i * k.itemStep, 0.35, 24)));
      const sp = prog(lt, k.sheet, k.sheet + 0.4);
      setT(sheet, { y: lt < k.sheet ? 200 : (1 - outCubic(sp)) * 200 });
      setT(install, { s: pressScale(lt, k.press) });
    },
  });
}

// ---------- penutup ----------
function ctaScene(def, text, logo, isLast) {
  const k = def.quick ? KEYS.ctaQuick : KEYS.cta;
  const checkSvg = () =>
    html(
      `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-strong)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`,
    );
  const icon = h("div", "", {}, [logoMark(logo, 250).el]);
  const chipLabels = ["Mulai dari 1 karyawan", "BPJS & PPh 21 otomatis", "Absen dari HP"];
  const chips = chipLabels.map((label) =>
    h(
      "div",
      "flex h-[78px] items-center gap-3.5 rounded-full border border-border-subtle bg-surface-solid px-8 text-[38px] font-bold text-text-primary shadow-glass",
      {},
      [checkSvg(), label],
    ),
  );
  // Harga ditonjolkan: "Hanya" + Rp10.000 besar + satuan
  const price = h("div", "mt-9 flex flex-col items-center rounded-[28px] border border-border-subtle bg-surface-solid px-12 pt-5 pb-6 shadow-glass", {}, [
    ...(text.pricePrefix ? [h("span", "text-[38px] font-bold text-text-secondary", {}, text.pricePrefix)] : []),
    h("span", "font-display text-[104px] leading-[1.02] font-extrabold tracking-[-0.04em] text-accent-strong tabular-nums", {}, text.price),
    h("span", "text-[38px] font-medium text-text-secondary", {}, text.priceUnit),
  ]);
  const button = h(
    "div",
    "mt-9 flex h-[132px] items-center rounded-full bg-accent px-16 font-display text-[62px] font-extrabold tracking-[-0.025em] text-on-accent shadow-overlay",
    {},
    text.cta,
  );
  const fine = h("p", "mt-5 text-[38px] font-medium text-text-secondary", {}, text.fine);
  const url = h("p", "mt-8 font-display text-[60px] font-extrabold tracking-[-0.02em] text-accent-strong", {}, text.url);
  const root = h(
    "div",
    "absolute inset-x-0 flex flex-col items-center justify-center text-center",
    { top: `${SAFE.top}px`, height: `${SAFE.bottom - SAFE.top}px` },
    [icon, h("div", "mt-8 flex flex-col items-center gap-3.5", {}, chips), price, button, fine, url],
  );
  return {
    root,
    update(lt) {
      setT(icon, pop(lt, k.icon, 0.45, 0));
      chips.forEach((c, i) => {
        const p = outCubic(prog(lt, k.chips[i], k.chips[i] + 0.4));
        setT(c, { x: (1 - p) * (i % 2 ? 120 : -120), o: p });
      });
      setT(price, pop(lt, k.price, 0.45, 0.7));
      const bp = prog(lt, k.button, k.button + 0.45);
      const breathe = lt > k.button + 0.45 ? 1 + 0.018 * Math.sin((2 * Math.PI * (lt - k.button - 0.45)) / 1.25) : 1;
      setT(button, { s: lt < k.button ? 0.7 : lerp(0.7, 1, outBack(bp)) * breathe, o: clamp(bp * 3) });
      setT(fine, rise(lt, k.fine));
      const up = prog(lt, k.url, k.url + 0.4);
      setT(url, { y: (1 - outCubic(up)) * 40, s: lerp(0.9, 1, outBack(up)), o: clamp(up * 2.5) });
      if (!isLast) setT(root, { o: 1 - prog(lt, def.dur - KEYS.exit, def.dur) });
    },
  };
}

// ---------- latar ----------
function backdrop() {
  const blobs = [
    { cls: "bg-shape-peach", size: 760, x: 560, y: -220, ph: 0 },
    { cls: "bg-shape-apricot", size: 520, x: -240, y: 1320, ph: 1.7 },
    { cls: "bg-shape-sand", size: 600, x: 700, y: 1500, ph: 3.1 },
    { cls: "bg-shape-cream", size: 480, x: -200, y: 380, ph: 4.4 },
  ].map((b) => ({ ...b, el: h("div", `absolute rounded-full ${b.cls}`, { width: `${b.size}px`, height: `${b.size}px`, left: `${b.x}px`, top: `${b.y}px` }) }));
  return {
    layer: h("div", "absolute inset-0 overflow-hidden bg-background", {}, blobs.map((b) => b.el)),
    update(t) {
      for (const b of blobs) setT(b.el, { x: 40 * Math.sin(t * 0.7 + b.ph), y: 30 * Math.cos(t * 0.6 + b.ph) });
    },
  };
}

function safeZoneOverlay() {
  const band = (top, height) => h("div", "absolute inset-x-0 bg-danger/15", { top: `${top}px`, height: `${height}px` });
  const line = (top) => h("div", "absolute inset-x-0 border-t-4 border-dashed border-danger", { top: `${top}px` });
  return h("div", "absolute inset-0", { pointerEvents: "none", display: "none" }, [band(0, SAFE.top), band(SAFE.bottom, HEIGHT - SAFE.bottom), line(SAFE.top), line(SAFE.bottom)]);
}

// ---------- API untuk render.mjs ----------
const SCENES = {
  hook: (def) => hookScene(def),
  logo: (def, c, isLast) => logoScene(def, c.logo, isLast),
  payroll: (def, c, isLast) => payrollScene(def, c.mockups, isLast),
  slip: (def, c, isLast) => slipScene(def, c.mockups, isLast),
  attendance: (def, c, isLast) => attendanceScene(def, c.mockups, isLast),
  leave: (def, c, isLast) => leaveScene(def, c.mockups, isLast),
  tasks: (def, c, isLast) => tasksScene(def, c.mockups, isLast),
  kpi: (def, c, isLast) => kpiScene(def, c.mockups, isLast),
  ai: (def, c, isLast) => aiScene(def, c.mockups, isLast),
  compliance: (def, c, isLast) => complianceScene(def, c.mockups, isLast),
  portal: (def, c, isLast) => portalScene(def, c.mockups, c.logo, isLast),
  cta: (def, c, isLast) => ctaScene(def, c.text, c.logo, isLast),
};

window.__init = async (config) => {
  const video = VIDEOS[config.videoId];
  await document.fonts.ready;
  const stage = document.getElementById("stage");
  stage.innerHTML = "";
  const bg = backdrop();
  stage.append(bg.layer);
  const instances = video.scenes.map((def, i) => {
    const isLast = i === video.scenes.length - 1;
    return { def, isLast, inst: SCENES[def.id](def, config, isLast) };
  });
  // Hook berada di atas scene lain (lapisan gelap tersapu ke atas memperlihatkan scene logo)
  for (const s of instances) if (s.inst.root) stage.append(s.inst.root);
  for (const s of instances) if (s.inst.layer) stage.append(s.inst.layer);
  const overlay = safeZoneOverlay();
  const label = h("div", "absolute top-6 left-6 rounded-[10px] bg-inverse px-4 py-2 font-display text-[34px] font-bold text-on-inverse", { display: "none" });
  stage.append(overlay, label);
  for (const s of instances) s.inst.afterMount?.();

  window.__render = (t, { safeZone = false, label: labelText = "" } = {}) => {
    bg.update(t);
    for (const { def, isLast, inst } of instances) {
      const lt = t - def.start;
      if (inst.layer) {
        inst.update(t);
        continue;
      }
      const visible = lt >= 0 && (isLast || lt < def.dur + 0.1);
      inst.root.style.display = visible ? "" : "none";
      if (visible) inst.update(lt, t);
    }
    overlay.style.display = safeZone ? "" : "none";
    label.style.display = labelText ? "" : "none";
    label.textContent = labelText;
  };
  return { duration: video.duration };
};
