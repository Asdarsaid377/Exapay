// QRIS statik merchant → QRIS dinamis bernominal (feature 41) — fungsi murni, tanpa I/O.
// Pola verssache/qris-dinamis (MIT): tag 01 "11" (statik) → "12" (dinamis), sisipkan tag 54 (nominal), hitung ulang
// CRC16 tag 63. Di sini payload diurai sebagai TLV EMVCo (tag 2 digit, panjang 2 digit, nilai) — bukan ganti-teks —
// agar teks "010211"/"5802ID" di dalam nilai lain tidak ikut terganti.

type TlvField = { tag: string; value: string };

// Tag 55–57 = pengaturan tip (minta tip / tip tetap / tip persen). Dibuang agar nominal yang dibayar persis sama
// dengan tagihan (pembayaran dicocokkan dari nominal unik).
const TIP_TAGS = new Set(["55", "56", "57"]);

export class QrisPayloadError extends Error {}

// CRC-16/CCITT-FALSE (poly 0x1021, awal 0xFFFF) sesuai spesifikasi QRIS — 4 digit hex huruf besar
export function qrisCrc16(text: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(text, "utf8")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function parseTlv(payload: string): TlvField[] {
  const fields: TlvField[] = [];
  let index = 0;
  while (index < payload.length) {
    const tag = payload.slice(index, index + 2);
    const length = Number(payload.slice(index + 2, index + 4));
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(payload.slice(index + 2, index + 4)) || index + 4 + length > payload.length) {
      throw new QrisPayloadError("struktur TLV tidak valid");
    }
    fields.push({ tag, value: payload.slice(index + 4, index + 4 + length) });
    index += 4 + length;
  }
  return fields;
}

function serialize(fields: readonly TlvField[]): string {
  return fields.map(({ tag, value }) => `${tag}${String(value.length).padStart(2, "0")}${value}`).join("");
}

function valueOf(fields: readonly TlvField[], tag: string): string | undefined {
  return fields.find((field) => field.tag === tag)?.value;
}

// Validasi payload QRIS statik dari merchant (isi QR yang dicetak). Melempar QrisPayloadError dengan alasan.
export function parseStaticQris(payload: string): TlvField[] {
  const trimmed = payload.trim();
  const fields = parseTlv(trimmed);
  const crc = fields.at(-1);
  if (crc?.tag !== "63" || crc.value.length !== 4) throw new QrisPayloadError("tag 63 (CRC) tidak ada di akhir payload");
  if (qrisCrc16(trimmed.slice(0, -4)) !== crc.value.toUpperCase()) throw new QrisPayloadError("CRC tidak cocok — payload rusak atau terpotong");
  if (valueOf(fields, "00") !== "01") throw new QrisPayloadError("tag 00 harus 01");
  if (valueOf(fields, "01") !== "11" && valueOf(fields, "01") !== "12") throw new QrisPayloadError("tag 01 harus 11 (statik) atau 12 (dinamis)");
  if (valueOf(fields, "53") !== "360") throw new QrisPayloadError("mata uang (tag 53) harus 360 / IDR");
  if (valueOf(fields, "58") !== "ID") throw new QrisPayloadError("kode negara (tag 58) harus ID");
  return fields.slice(0, -1);
}

// Nominal numeric ("50123.00") → nilai tag 54: rupiah bulat tanpa desimal, sen hanya bila ada ("50123.5" → "50123.50")
export function qrisAmountValue(amount: string): string {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match?.[1]) throw new QrisPayloadError(`nominal tidak valid: ${amount}`);
  const whole = match[1].replace(/^0+(?=\d)/, "");
  const cents = (match[2] ?? "").padEnd(2, "0");
  if (whole === "0" && cents === "00") throw new QrisPayloadError("nominal harus lebih dari 0");
  const value = cents === "00" ? whole : `${whole}.${cents}`;
  if (value.length > 13) throw new QrisPayloadError("nominal terlalu besar untuk QRIS");
  return value;
}

// Payload QRIS dinamis dengan nominal tetap. Tag tetap berurutan naik (54 setelah 53, sebelum 58).
export function qrisWithAmount(staticPayload: string, amount: string): string {
  const fields = parseStaticQris(staticPayload).filter((field) => field.tag !== "54" && !TIP_TAGS.has(field.tag));
  const amountField: TlvField = { tag: "54", value: qrisAmountValue(amount) };
  const withType = fields.map((field) => (field.tag === "01" ? { tag: "01", value: "12" } : field));
  const insertAt = withType.findIndex((field) => field.tag > "54");
  const ordered = insertAt === -1 ? [...withType, amountField] : [...withType.slice(0, insertAt), amountField, ...withType.slice(insertAt)];
  const body = `${serialize(ordered)}6304`;
  return `${body}${qrisCrc16(body)}`;
}
