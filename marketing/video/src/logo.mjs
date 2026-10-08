// Logo Exapay dari apps/web/public/exapaylogo.png (2000×2000, latar putih) → PNG transparan + 3 lapis untuk animasi.
// "Color to alpha" dua warna: setiap piksel dianggap campuran warna logo (abu #494949 atau orange #FF800D) dengan
// putih; alpha = seberapa jauh dari putih, warna diset ke warna logo murni → tepi halus tanpa halo putih.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const GRAY = [0x49, 0x49, 0x49];
const ORANGE = [0xff, 0x80, 0x0d];
// Batas lapis (piksel sumber): ikon sapuan orange di atas huruf, tulisan "Exapay" di bawahnya (diukur 2026-10-08)
const WORDMARK_TOP = 1000;
const PAD = 24;

export function buildLogo(srcFile, outDir) {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", srcFile, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 28 });
  const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", srcFile]).toString().trim();
  const [W, H] = probe.split(",").map(Number);

  // Batas logo (piksel yang tidak putih)
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (raw[i] < 245 || raw[i + 1] < 245 || raw[i + 2] < 245) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  const x0 = Math.max(0, minX - PAD), y0 = Math.max(0, minY - PAD);
  const w = Math.min(W, maxX + PAD + 1) - x0, h = Math.min(H, maxY + PAD + 1) - y0;

  const layers = { full: Buffer.alloc(w * h * 4), swoosh: Buffer.alloc(w * h * 4), letter: Buffer.alloc(w * h * 4), word: Buffer.alloc(w * h * 4) };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const si = ((y + y0) * W + (x + x0)) * 4;
      const [r, g, b] = [raw[si], raw[si + 1], raw[si + 2]];
      const isOrange = r - b > 12;
      const color = isOrange ? ORANGE : GRAY;
      // alpha dari kanal yang paling jauh dari putih pada warna logo (biru untuk orange, rata-rata untuk abu)
      const alpha = isOrange ? (255 - b) / (255 - ORANGE[2]) : (255 - (r + g + b) / 3) / (255 - GRAY[0]);
      const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
      if (a === 0) continue;
      const layer = !isOrange ? "letter" : y + y0 < WORDMARK_TOP ? "swoosh" : "word";
      const di = (y * w + x) * 4;
      for (const name of ["full", layer]) {
        layers[name][di] = color[0];
        layers[name][di + 1] = color[1];
        layers[name][di + 2] = color[2];
        layers[name][di + 3] = a;
      }
    }

  mkdirSync(outDir, { recursive: true });
  const files = {};
  for (const [name, buf] of Object.entries(layers)) {
    const file = path.join(outDir, `exapay-logo-${name}.png`);
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-i", "-", "-frames:v", "1", file], { input: buf });
    files[name] = file;
  }
  return { width: w, height: h, files };
}

// Dijalankan langsung: node src/logo.mjs <sumber.png> <folder-hasil>
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const [src, out] = process.argv.slice(2);
  const res = buildLogo(src, out);
  writeFileSync(path.join(out, "logo.json"), JSON.stringify(res, null, 2));
  console.log(res);
}
