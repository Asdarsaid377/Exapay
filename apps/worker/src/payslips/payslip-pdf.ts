import PDFDocument from "pdfkit";

import type { PayslipContent, PayslipLine, PayslipSection } from "./payslip-content.js";

// Render slip gaji (feature 31) ke PDF A4 dengan pdfkit — font standar Helvetica (tanpa file font; teks WinAnsi).
// Tanpa referensi desain (izin user): warna dari ui-tokens (aksen oranye, teks cokelat tua), tata letak slip standar —
// kepala usaha, identitas karyawan, pendapatan, potongan, gaji diterima, keterangan.

const COLOR = {
  text: "#221208",
  secondary: "#5B4636",
  tertiary: "#8A7565",
  accent: "#F2790F",
  accentSoft: "#FDEBDA",
  fill: "#F7F1EA",
  border: "#E7DDD3",
};
const MARGIN = 48;
const FONT = "Helvetica";
const BOLD = "Helvetica-Bold";

export type PayslipPdfMeta = { title: string; author: string };

export function renderPayslipPdf(content: PayslipContent, meta: PayslipPdfMeta): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, info: { Title: meta.title, Author: meta.author, Creator: "Exapay" } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = MARGIN;
  const width = doc.page.width - MARGIN * 2;
  const right = left + width;

  // Pindah halaman bila sisa ruang kurang dari `height`
  const ensureSpace = (height: number): void => {
    if (doc.y + height > doc.page.height - MARGIN) doc.addPage();
  };

  // ——— Kepala: usaha (kiri) · SLIP GAJI + bulan (kanan) ———
  const top = doc.y;
  const headerLeftWidth = width * 0.6;
  doc.font(BOLD).fontSize(15).fillColor(COLOR.text).text(content.company.name, left, top, { width: headerLeftWidth });
  if (content.company.address) {
    doc.moveDown(0.2).font(FONT).fontSize(9).fillColor(COLOR.secondary).text(content.company.address, { width: headerLeftWidth });
  }
  const leftBottom = doc.y;
  doc.font(BOLD).fontSize(18).fillColor(COLOR.accent).text("SLIP GAJI", left, top, { width, align: "right" });
  doc.font(FONT).fontSize(11).fillColor(COLOR.text).text(content.monthLabel, left, doc.y + 2, { width, align: "right" });
  doc.y = Math.max(leftBottom, doc.y) + 12;
  doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(2).strokeColor(COLOR.accent).stroke();
  doc.y += 14;

  // ——— Identitas karyawan: dua kolom label/nilai ———
  const columnWidth = (width - 24) / 2;
  const labelWidth = 84;
  const half = Math.ceil(content.details.length / 2);
  const detailTop = doc.y;
  let columnBottom = detailTop;
  [content.details.slice(0, half), content.details.slice(half)].forEach((items, column) => {
    const x = left + column * (columnWidth + 24);
    let y = detailTop;
    for (const item of items) {
      doc.font(FONT).fontSize(9).fillColor(COLOR.tertiary).text(item.label, x, y, { width: labelWidth });
      doc.font(BOLD).fontSize(9.5).fillColor(COLOR.text).text(item.value, x + labelWidth, y, { width: columnWidth - labelWidth });
      y = Math.max(doc.y, y + 12) + 5;
    }
    columnBottom = Math.max(columnBottom, y);
  });
  doc.y = columnBottom + 10;

  // ——— Baris nominal ———
  const amountWidth = 130;
  const labelColumn = width - amountWidth - 16;
  const line = (item: PayslipLine): void => {
    doc.font(FONT).fontSize(10);
    const noteHeight = item.note ? doc.font(FONT).fontSize(8).heightOfString(item.note, { width: labelColumn - 12 }) + 2 : 0;
    const labelHeight = doc.font(FONT).fontSize(10).heightOfString(item.label, { width: labelColumn - 12 });
    const height = labelHeight + noteHeight + 8;
    ensureSpace(height);
    const y = doc.y;
    doc.font(FONT).fontSize(10).fillColor(COLOR.text).text(item.label, left + 12, y + 4, { width: labelColumn - 12 });
    if (item.note) doc.font(FONT).fontSize(8).fillColor(COLOR.tertiary).text(item.note, left + 12, doc.y + 1, { width: labelColumn - 12 });
    doc.font(FONT).fontSize(10).fillColor(COLOR.text).text(item.amount, right - amountWidth - 12, y + 4, { width: amountWidth, align: "right" });
    doc.y = y + height;
    doc.moveTo(left + 12, doc.y).lineTo(right - 12, doc.y).lineWidth(0.5).strokeColor(COLOR.border).stroke();
  };

  const sectionTitle = (title: string): void => {
    ensureSpace(60);
    doc.font(BOLD).fontSize(10).fillColor(COLOR.secondary).text(title.toUpperCase(), left, doc.y, { width, characterSpacing: 0.6 });
    doc.y += 2;
  };

  const totalRow = (label: string, amount: string): void => {
    ensureSpace(28);
    const y = doc.y + 4;
    doc.roundedRect(left, y, width, 24, 6).fill(COLOR.fill);
    doc.font(BOLD).fontSize(10).fillColor(COLOR.text).text(label, left + 12, y + 7, { width: labelColumn - 12 });
    doc.font(BOLD).fontSize(10.5).fillColor(COLOR.text).text(amount, right - amountWidth - 12, y + 7, { width: amountWidth, align: "right" });
    doc.y = y + 24 + 12;
  };

  const section = (data: PayslipSection): void => {
    sectionTitle(data.title);
    for (const item of data.lines) line(item);
    totalRow(data.totalLabel, data.total);
  };

  section(content.earnings);
  section(content.deductions);

  // ——— Gaji diterima ———
  ensureSpace(52);
  const takeHomeY = doc.y;
  doc.roundedRect(left, takeHomeY, width, 44, 8).fill(COLOR.accentSoft);
  doc.font(BOLD).fontSize(11).fillColor(COLOR.text).text("GAJI DITERIMA", left + 14, takeHomeY + 16, { width: labelColumn - 14, characterSpacing: 0.6 });
  doc.font(BOLD).fontSize(16).fillColor(COLOR.text).text(content.takeHomePay, right - amountWidth - 54, takeHomeY + 13, { width: amountWidth + 40, align: "right" });
  doc.y = takeHomeY + 44 + 14;

  // ——— Keterangan ———
  if (content.employerContributions) {
    sectionTitle("Ditanggung perusahaan (tidak dipotong dari gaji)");
    for (const item of content.employerContributions.lines) line(item);
    totalRow("Total iuran BPJS perusahaan", content.employerContributions.total);
  }
  if (content.notes.length > 0) {
    sectionTitle("Keterangan");
    for (const note of content.notes) {
      ensureSpace(16);
      doc.font(FONT).fontSize(9).fillColor(COLOR.secondary).text(`•  ${note}`, left + 12, doc.y, { width: width - 24 });
      doc.y += 3;
    }
    doc.y += 8;
  }

  // ——— Catatan kaki ———
  ensureSpace(30);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(0.5).strokeColor(COLOR.border).stroke();
  doc.y += 8;
  doc.font(FONT).fontSize(8).fillColor(COLOR.tertiary).text(content.footer, left, doc.y, { width });

  doc.end();
  return done;
}
