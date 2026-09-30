import { describe, expect, it } from "vitest";

import { detectAttachmentType, safeAttachmentName } from "../src/modules/attendance/leave-attachment.js";

describe("lampiran pengajuan izin", () => {
  it("jenis file dari isi, bukan dari nama", () => {
    expect(detectAttachmentType(Buffer.from("%PDF-1.7\n…"))).toBe("application/pdf");
    expect(detectAttachmentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe("image/jpeg");
    expect(detectAttachmentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe("image/png");
    expect(detectAttachmentType(Buffer.from("<svg xmlns=…"))).toBeNull();
    expect(detectAttachmentType(Buffer.alloc(0))).toBeNull();
  });

  it("nama file aman: tanpa path & karakter kontrol, ekstensi mengikuti jenis asli", () => {
    expect(safeAttachmentName("surat dokter.PNG", "image/png")).toBe("surat dokter.png");
    expect(safeAttachmentName("../../etc/passwd", "application/pdf")).toBe("passwd.pdf");
    expect(safeAttachmentName("C:\\Users\\budi\\scan.jpeg", "image/jpeg")).toBe("scan.jpg");
    expect(safeAttachmentName("foto.exe", "image/png")).toBe("foto.png");
    expect(safeAttachmentName("a\"b\u0000c.pdf", "application/pdf")).toBe("abc.pdf");
    expect(safeAttachmentName("", "application/pdf")).toBe("lampiran.pdf");
    // Nama UTF-8 yang dibaca multer sebagai latin1 dikembalikan
    expect(safeAttachmentName(Buffer.from("surat-é.pdf", "utf8").toString("latin1"), "application/pdf")).toBe("surat-é.pdf");
    expect(safeAttachmentName("x".repeat(300), "image/png")).toHaveLength(120);
  });
});
