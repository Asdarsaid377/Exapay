import { describe, expect, it } from "vitest";

import { parseStaticQris, qrisAmountValue, qrisCrc16, QrisPayloadError, qrisWithAmount } from "../src/modules/billing/qris.js";

// Feature 41: QRIS statik → dinamis. Vektor diharapkan dihitung terpisah dengan pendekatan ganti-teks
// verssache/qris-dinamis (010211 → 010212, sisip 54 sebelum 5802ID, CRC16 ulang) — implementasi TLV harus identik.

// Payload contoh fiktif (merchant tidak nyata) dengan CRC benar
const STATIC_QRIS =
  "00020101021126390013ID.EXAPAY.WWW011893600899000000000151660014ID.CO.QRIS.WWW01189360089900000000010215ID20240000000010303UMI5204581253033605802ID5913EXAPAY CONTOH6008MAKASSAR61059011162070703A0163045BBB";
const DYNAMIC_50123 =
  "00020101021226390013ID.EXAPAY.WWW011893600899000000000151660014ID.CO.QRIS.WWW01189360089900000000010215ID20240000000010303UMI5204581253033605405501235802ID5913EXAPAY CONTOH6008MAKASSAR61059011162070703A0163049ADD";

function tlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, "0")}${value}`;
}

function withCrc(body: string): string {
  return `${body}6304${qrisCrc16(`${body}6304`)}`;
}

describe("qrisCrc16", () => {
  it("CRC-16/CCITT-FALSE: nilai cek standar '123456789' = 29B1", () => {
    expect(qrisCrc16("123456789")).toBe("29B1");
  });
});

describe("qrisWithAmount", () => {
  it("payload contoh: tag 01 → 12, tag 54 disisipkan sebelum 58, CRC dihitung ulang", () => {
    expect(qrisWithAmount(STATIC_QRIS, "50123.00")).toBe(DYNAMIC_50123);
  });

  it("hasil tetap QRIS valid (lolos validasi + CRC) dan bisa diberi nominal ulang", () => {
    const dynamic = qrisWithAmount(STATIC_QRIS, "75999.00");
    expect(() => parseStaticQris(dynamic)).not.toThrow();
    expect(dynamic).toContain(tlv("54", "75999"));
    // Payload dinamis lama dipakai sebagai sumber → tag 54 lama diganti, bukan digandakan
    expect(qrisWithAmount(dynamic, "50123.00")).toBe(DYNAMIC_50123);
  });

  it("tag tip (55/56/57) dibuang agar nominal dibayar persis", () => {
    const base = tlv("00", "01") + tlv("01", "11") + tlv("26", tlv("00", "ID.EXAPAY.WWW")) + tlv("52", "5812") + tlv("53", "360");
    const tail = tlv("58", "ID") + tlv("59", "TOKO") + tlv("60", "MAKASSAR");
    const withTip = withCrc(base + tlv("55", "01") + tail);
    expect(qrisWithAmount(withTip, "10000.00")).toBe(withCrc(base.replace(tlv("01", "11"), tlv("01", "12")) + tlv("54", "10000") + tail));
  });

  it("teks '010211' / '5802ID' di dalam nilai lain tidak ikut terganti", () => {
    const tricky = withCrc(tlv("00", "01") + tlv("01", "11") + tlv("26", tlv("00", "X010211X5802IDX")) + tlv("53", "360") + tlv("58", "ID") + tlv("59", "TOKO"));
    const dynamic = qrisWithAmount(tricky, "5000.00");
    expect(dynamic).toContain("X010211X5802IDX");
    expect(dynamic.startsWith(tlv("00", "01") + tlv("01", "12"))).toBe(true);
  });
});

describe("parseStaticQris", () => {
  it("menolak CRC salah, terpotong, mata uang/negara lain", () => {
    expect(() => parseStaticQris(`${STATIC_QRIS.slice(0, -4)}0000`)).toThrow(QrisPayloadError);
    expect(() => parseStaticQris(STATIC_QRIS.slice(0, -10))).toThrow(QrisPayloadError);
    expect(() => parseStaticQris(withCrc(tlv("00", "01") + tlv("01", "11") + tlv("53", "840") + tlv("58", "ID")))).toThrow(/mata uang/);
    expect(() => parseStaticQris(withCrc(tlv("00", "01") + tlv("01", "11") + tlv("53", "360") + tlv("58", "SG")))).toThrow(/negara/);
    expect(() => parseStaticQris("bukan qris")).toThrow(QrisPayloadError);
  });
});

describe("qrisAmountValue", () => {
  it("rupiah bulat tanpa desimal; sen hanya bila ada; nol & terlalu besar ditolak", () => {
    expect(qrisAmountValue("50123.00")).toBe("50123");
    expect(qrisAmountValue("50123")).toBe("50123");
    expect(qrisAmountValue("50123.5")).toBe("50123.50");
    expect(() => qrisAmountValue("0.00")).toThrow(QrisPayloadError);
    expect(() => qrisAmountValue("12345678901234.00")).toThrow(QrisPayloadError);
  });
});
