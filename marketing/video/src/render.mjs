#!/usr/bin/env node
// Render video promosi Exapay ke MP4 (1080×1920, 30 fps, H.264 + AAC). Tanpa AI — cukup Node, Chrome, dan ffmpeg.
// Pemakaian & opsi: lihat README.md di folder ini.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import * as esbuild from "esbuild";
import puppeteer from "puppeteer-core";

import { buildLogo } from "./logo.mjs";
import { DEFAULT_TEXT, FPS, HEIGHT, MUSIC, SFX, VIDEOS, WIDTH, videoCues } from "./timeline.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(ROOT, "../..");
const BUILD = path.join(ROOT, "build");
const DEFAULT_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Volume dasar efek suara (file Kenney sudah dinormalisasi ±-1 dBFS); dikali gain per cue di timeline.mjs
const SFX_LEVEL = 0.6;

const { values: opts } = parseArgs({
  allowPositionals: false,
  options: {
    video: { type: "string", default: "all" },
    still: { type: "string", multiple: true },
    sheet: { type: "boolean", default: false },
    "no-safe-zone": { type: "boolean", default: false },
    cta: { type: "string" },
    fine: { type: "string" },
    price: { type: "string" },
    "price-unit": { type: "string" },
    "price-prefix": { type: "string" },
    url: { type: "string" },
    out: { type: "string", default: path.join(ROOT, "out") },
    chrome: { type: "string", default: process.env.CHROME_PATH ?? DEFAULT_CHROME },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (opts.help) {
  console.log(`node src/render.mjs [opsi]
  --video story|long|extended|short|all  video yang dirender (bawaan: all; long = 30 s, extended = 42,5 s)
  --still 1.5 --still 6.0   simpan frame PNG di detik tertentu (tanpa membuat MP4); boleh "1.5,6.0"
  --sheet                   frame kunci tiap scene + contact sheet (tanpa membuat MP4)
  --no-safe-zone            jangan gambar garis zona aman di pratinjau
  --cta "..."               teks tombol ajakan (bawaan: "${DEFAULT_TEXT.cta}")
  --fine "..."              baris kecil di bawah tombol
  --price "..."             harga (bawaan: "${DEFAULT_TEXT.price}"), --price-unit "..." satuannya,
                            --price-prefix "..." kata di atas harga (bawaan: "${DEFAULT_TEXT.pricePrefix}", "" = tanpa)
  --url "..."               URL di akhir video
  --out DIR                 folder hasil (bawaan: out/)
  --chrome PATH             lokasi Google Chrome (atau env CHROME_PATH)`);
  process.exit(0);
}

const text = {
  ...DEFAULT_TEXT,
  ...(opts.cta && { cta: opts.cta }),
  ...(opts.fine && { fine: opts.fine }),
  ...(opts.price && { price: opts.price }),
  ...(opts["price-unit"] && { priceUnit: opts["price-unit"] }),
  ...(opts["price-prefix"] !== undefined && { pricePrefix: opts["price-prefix"] }),
  ...(opts.url && { url: opts.url }),
};
const videoIds = opts.video === "all" ? Object.keys(VIDEOS) : opts.video.split(",");
for (const id of videoIds) if (!VIDEOS[id]) fail(`Video tidak dikenal: ${id} (pilihan: ${Object.keys(VIDEOS).join(", ")}, all)`);
const stills = (opts.still ?? []).flatMap((s) => s.split(",")).map(Number);
if (stills.some((t) => Number.isNaN(t))) fail("--still harus berupa angka detik, mis. --still 1.5 --still 6");

function fail(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}
function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28, ...options }).toString();
}

// ---------- 1. Build halaman scene ----------
async function buildScene() {
  mkdirSync(BUILD, { recursive: true });
  // Komponen landing asli → HTML statis (react/lucide dari node_modules folder ini)
  const mockupsFile = path.join(BUILD, "mockups.mjs");
  await esbuild.build({
    entryPoints: [path.join(ROOT, "src/mockups.tsx")],
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    outfile: mockupsFile,
    alias: { "@": path.join(REPO, "apps/web") },
    external: ["react", "react-dom", "react/*", "react-dom/*", "lucide-react"],
    logLevel: "warning",
  });
  const { renderMockups } = await import(`${pathToFileURL(mockupsFile).href}?v=${Date.now()}`);
  const mockups = renderMockups();
  const flat = (v) => (typeof v === "string" ? [v] : Object.values(v).flatMap(flat));
  writeFileSync(path.join(BUILD, "mockups.html"), flat(mockups).join("\n"));

  // Token & utility dari app (satu sumber kebenaran) tanpa @import tailwindcss milik app
  const globals = readFileSync(path.join(REPO, "apps/web/app/globals.css"), "utf8");
  writeFileSync(path.join(BUILD, "theme.css"), globals.replace(/^@import "tailwindcss";\s*$/m, ""));
  run(path.join(ROOT, "node_modules/.bin/tailwindcss"), ["-i", "src/styles.css", "-o", "build/styles.css"], { cwd: ROOT });

  const sceneFile = path.join(BUILD, "scene.js");
  await esbuild.build({ entryPoints: [path.join(ROOT, "src/scene.js")], bundle: true, format: "iife", platform: "browser", outfile: sceneFile, logLevel: "warning" });

  // Logo resmi (apps/web/public/exapaylogo.png) → PNG transparan per lapis, disisipkan sebagai data URI
  const logoRes = buildLogo(path.join(REPO, "apps/web/public/exapaylogo.png"), path.join(BUILD, "logo"));
  const logo = {
    width: logoRes.width,
    height: logoRes.height,
    ...Object.fromEntries(Object.entries(logoRes.files).map(([k, f]) => [k, `data:image/png;base64,${readFileSync(f).toString("base64")}`])),
  };

  const font = (file) => readFileSync(path.join(ROOT, "assets/fonts", file)).toString("base64");
  const fontCss = `
@font-face { font-family: "Plus Jakarta Sans"; font-weight: 200 800; src: url(data:font/ttf;base64,${font("PlusJakartaSans[wght].ttf")}) format("truetype"); }
@font-face { font-family: "DM Sans"; font-weight: 100 1000; src: url(data:font/ttf;base64,${font("DMSans[opsz,wght].ttf")}) format("truetype"); }`;
  const htmlFile = path.join(BUILD, "index.html");
  writeFileSync(
    htmlFile,
    `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>${fontCss}</style><style>${readFileSync(path.join(BUILD, "styles.css"), "utf8")}</style></head>` +
      `<body class="font-sans text-text-primary antialiased"><div id="stage"></div><script>${readFileSync(sceneFile, "utf8")}</script></body></html>`,
  );
  return { htmlFile, mockups, logo };
}

// ---------- 2. Chrome ----------
async function openPage(browser, build, videoId) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(pathToFileURL(build.htmlFile).href, { waitUntil: "load" });
  await page.evaluate((cfg) => window.__init(cfg), { videoId, text, mockups: build.mockups, logo: build.logo });
  if (errors.length) fail(`Error di halaman scene:\n${errors.join("\n")}`);
  return page;
}
// Pratinjau (still/sheet): garis zona aman + label waktu digambar di halaman (ffmpeg lokal tanpa drawtext)
async function frameAt(page, t, preview = false) {
  await page.evaluate((tt, pv) => window.__render(tt, pv), t, preview ? { safeZone: !opts["no-safe-zone"], label: `${t.toFixed(2)} s` } : {});
  return page.screenshot({ type: "png", optimizeForSpeed: true });
}

// ---------- 3. Pratinjau ----------
// Frame kunci per scene: saat aksen animasi selesai, sebelum scene keluar
function sheetTimes(video) {
  return video.scenes.map((s) => +(s.start + s.dur - (s === video.scenes.at(-1) ? 0.05 : 0.3)).toFixed(2));
}
function contactSheet(files, outFile) {
  const inputs = files.flatMap((f) => ["-i", f]);
  const scaled = files.map((_, i) => `[${i}:v]scale=360:640[v${i}]`).join(";");
  run("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", `${scaled};${files.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${files.length}`, "-frames:v", "1", outFile]);
}
async function renderStills(browser, build, videoId, times, outDir, suffix) {
  const page = await openPage(browser, build, videoId);
  mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const t of times) {
    const file = path.join(outDir, `${videoId}_${t.toFixed(2)}s.png`);
    writeFileSync(file, await frameAt(page, t, true));
    files.push(file);
  }
  await page.close();
  if (files.length > 1) {
    const sheet = path.join(outDir, `${videoId}_${suffix}.png`);
    contactSheet(files, sheet);
    console.log(`  contact sheet: ${path.relative(ROOT, sheet)}`);
  }
  files.forEach((f) => console.log(`  ${path.relative(ROOT, f)}`));
}

// ---------- 4. Video ----------
async function renderVideoTrack(browser, build, videoId, outFile) {
  const video = VIDEOS[videoId];
  const page = await openPage(browser, build, videoId);
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), outFile], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => ff.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg video keluar dengan kode ${c}`)))));
  const total = Math.round(video.duration * FPS);
  for (let i = 0; i < total; i++) {
    const png = await frameAt(page, i / FPS);
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % FPS === 0) process.stdout.write(`\r  frame ${i}/${total}`);
  }
  ff.stdin.end();
  await done;
  process.stdout.write(`\r  frame ${total}/${total}\n`);
  await page.close();
}

function mixAudio(videoId, outFile) {
  const video = VIDEOS[videoId];
  const d = video.duration;
  const cues = videoCues(video);
  const inputs = ["-i", path.join(ROOT, MUSIC.file), ...cues.flatMap((c) => ["-i", path.join(ROOT, SFX[c.sfx])])];
  const fmt = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";
  const music =
    `[0:a]atrim=start=${MUSIC.start},asetpts=PTS-STARTPTS,atempo=${MUSIC.tempo.toFixed(5)},atrim=0:${d},asetpts=PTS-STARTPTS,${fmt},` +
    `volume=${MUSIC.volume},afade=t=in:d=${MUSIC.fadeIn},afade=t=out:st=${(d - MUSIC.fadeOut).toFixed(2)}:d=${MUSIC.fadeOut}[m]`;
  const sfx = cues.map((c, i) => `[${i + 1}:a]${fmt},volume=${(SFX_LEVEL * (c.gain ?? 1)).toFixed(3)},adelay=${Math.round(c.t * 1000)}:all=1[s${i}]`);
  const mix = `[m]${cues.map((_, i) => `[s${i}]`).join("")}amix=inputs=${cues.length + 1}:normalize=0:duration=first,alimiter=limit=0.85:attack=2:release=60:level=false[a]`;
  run("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", [music, ...sfx, mix].join(";"), "-map", "[a]", "-t", String(d), "-c:a", "pcm_s16le", outFile]);
}

function volumeStats(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  return { mean: Number(r.match(/mean_volume: (-?[\d.]+) dB/)?.[1]), max: Number(r.match(/max_volume: (-?[\d.]+) dB/)?.[1]) };
}

async function renderVideo(browser, build, videoId) {
  const video = VIDEOS[videoId];
  mkdirSync(opts.out, { recursive: true });
  const tmpVideo = path.join(BUILD, `${videoId}.video.mp4`);
  const tmpAudio = path.join(BUILD, `${videoId}.audio.wav`);
  const outFile = path.join(opts.out, video.file);
  const t0 = Date.now();
  await renderVideoTrack(browser, build, videoId, tmpVideo);
  mixAudio(videoId, tmpAudio);
  run("ffmpeg", ["-y", "-v", "error", "-i", tmpVideo, "-i", tmpAudio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-t", String(video.duration), "-movflags", "+faststart", outFile]);
  rmSync(tmpVideo);
  rmSync(tmpAudio);

  const probe = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,sample_rate,channels", "-of", "json", outFile]));
  const v = probe.streams.find((s) => s.codec_type === "video");
  const a = probe.streams.find((s) => s.codec_type === "audio");
  const vol = volumeStats(outFile);
  console.log(`  ✔ ${path.relative(ROOT, outFile)} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log(`    durasi ${Number(probe.format.duration).toFixed(3)} s · ${v.width}×${v.height} ${v.codec_name} ${v.pix_fmt} ${v.r_frame_rate} fps · audio ${a ? `${a.codec_name} ${a.sample_rate} Hz ${a.channels} ch` : "TIDAK ADA"}`);
  console.log(`    mean_volume ${vol.mean} dB · max_volume ${vol.max} dB`);

  // Frame di setiap pergantian scene (0,1 s sebelum & sesudah) → contact sheet untuk cek transisi
  const checkDir = path.join(opts.out, "check");
  mkdirSync(checkDir, { recursive: true });
  const times = video.scenes.slice(1).flatMap((s) => [s.start - 0.1, s.start + 0.1]);
  const files = times.map((t) => {
    const f = path.join(checkDir, `${videoId}_mp4_${t.toFixed(2)}s.png`);
    run("ffmpeg", ["-y", "-v", "error", "-ss", t.toFixed(3), "-i", outFile, "-frames:v", "1", f]);
    return f;
  });
  const sheet = path.join(checkDir, `${videoId}_transitions.png`);
  contactSheet(files, sheet);
  console.log(`    transisi: ${path.relative(ROOT, sheet)}`);
}

// ---------- main ----------
if (!existsSync(opts.chrome)) fail(`Chrome tidak ditemukan di ${opts.chrome}. Pakai --chrome PATH atau env CHROME_PATH.`);
console.log("• build scene");
const build = await buildScene();
const browser = await puppeteer.launch({
  executablePath: opts.chrome,
  headless: true,
  args: ["--force-color-profile=srgb", "--hide-scrollbars", "--font-render-hinting=none", "--disable-lcd-text"],
});
try {
  for (const id of videoIds) {
    if (stills.length) {
      console.log(`• still ${id}`);
      await renderStills(browser, build, id, stills, path.join(opts.out, "stills"), "stills");
    } else if (opts.sheet) {
      console.log(`• contact sheet ${id}`);
      await renderStills(browser, build, id, sheetTimes(VIDEOS[id]), path.join(opts.out, "stills"), "sheet");
    } else {
      console.log(`• render ${id}`);
      await renderVideo(browser, build, id);
    }
  }
} finally {
  await browser.close();
}
