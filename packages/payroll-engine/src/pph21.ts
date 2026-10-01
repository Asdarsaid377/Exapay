import type {
  PayrollCalculationResult,
  PayrollRegulations,
  Pph21PeriodRecord,
  Pph21PreviousEmployer,
  Pph21Result,
  PtkpStatus,
  TaxBracket,
  TaxRateKind,
} from "@exapay/shared";

import { money, Money, percent, roundRupiah, rupiah, toMoneyString, ZERO } from "./money.js";
import { PayrollInputError } from "./payroll-calculation.js";

// PPh 21 pegawai tetap satu masa (feature 26) — fungsi murni. PP 58/2023 & PMK 168/2023 (contoh di lampiran PMK).
//
// Aturan perhitungan:
// - Penghasilan bruto masa = gaji + semua tunjangan (termasuk THR/bonus yang dibayar masa itu) + premi BPJS Kesehatan,
//   JKK, JKM yang dibayar pemberi kerja. Iuran JHT/JP bagian pemberi kerja bukan penghasilan pegawai.
// - Masa selain masa pajak terakhir: bruto × TER bulanan kategori PTKP (lapis pertama dengan bruto ≤ batas).
// - Masa pajak terakhir = Desember, atau bulan terakhir bekerja bila berhenti sebelum Desember:
//   · bruto setahun = bruto masa-masa sebelumnya di pemberi kerja ini + masa ini
//   · biaya jabatan = 5% × bruto, maks Rp500.000 × jumlah bulan bekerja (dan maks Rp6 jt setahun)
//   · neto = bruto − biaya jabatan − iuran JHT/JP pegawai − zakat/sumbangan keagamaan wajib (+ neto pemberi kerja lama)
//   · PKP = neto − PTKP setahun penuh (tidak disetahunkan), dibulatkan ke bawah ribuan penuh
//   · PPh masa ini = tarif Pasal 17 × PKP − PPh yang sudah dipotong (pemberi kerja ini + pemberi kerja lama).
//     Negatif = kelebihan potong, dikembalikan ke pegawai.
// - Tidak ditangani: penyetahunan bagi WP yang baru/berhenti menjadi subjek pajak dalam negeri, PPh ditanggung
//   pemberi kerja (gross-up), pegawai tidak tetap.
// - Pembulatan: PPh dibulatkan ke rupiah penuh HALF_UP (keputusan feature 17).

export type Pph21CurrentPeriod = {
  grossIncome: string;
  pensionContribution: string;
  religiousContribution: string;
};

export type Pph21Input = {
  ptkpStatus: PtkpStatus;
  // Masa pajak 1–12
  month: number;
  // true jika pegawai berhenti bekerja di masa ini (masa pajak terakhir sebelum Desember)
  endsEmployment: boolean;
  current: Pph21CurrentPeriod;
  // Masa sebelumnya di tahun pajak yang sama pada pemberi kerja ini (hanya dipakai di masa pajak terakhir)
  previousPeriods: readonly Pph21PeriodRecord[];
  previousEmployer: Pph21PreviousEmployer | null;
  regulations: Pick<PayrollRegulations, "taxTables" | "ptkp" | "pph21">;
};

const THOUSAND = 1000;

// Penghasilan bruto & iuran pensiun pegawai masa ini, diambil dari hasil calculatePayroll (feature 25)
export function pph21IncomeFromPayroll(result: PayrollCalculationResult): Omit<Pph21CurrentPeriod, "religiousContribution"> {
  let grossIncome = money(result.grossPay);
  let pensionContribution = ZERO;
  for (const line of result.bpjs) {
    if (line.program === "kesehatan" || line.program === "jkk" || line.program === "jkm") {
      grossIncome = grossIncome.plus(money(line.employerAmount));
    } else {
      pensionContribution = pensionContribution.plus(money(line.employeeAmount));
    }
  }
  return { grossIncome: toMoneyString(grossIncome), pensionContribution: toMoneyString(pensionContribution) };
}

// Gaji diterima pegawai = gaji bersih sebelum PPh 21 (calculatePayroll) − PPh 21 masa ini. PPh negatif (kelebihan potong
// di masa pajak terakhir) dikembalikan → menambah gaji diterima.
export function takeHomePay(result: PayrollCalculationResult, tax: Pph21Result): string {
  return toMoneyString(money(result.netPay).minus(money(tax.pph21)));
}

function nonNegative(value: string, label: string): Money {
  let amount: Money;
  try {
    amount = money(value);
  } catch {
    throw new PayrollInputError(`${label} tidak valid: "${value}"`);
  }
  if (!amount.isFinite() || amount.isNegative()) throw new PayrollInputError(`${label} harus ≥ 0`);
  return amount;
}

function amountOf(value: string, label: string): Money {
  let amount: Money;
  try {
    amount = money(value);
  } catch {
    throw new PayrollInputError(`${label} tidak valid: "${value}"`);
  }
  if (!amount.isFinite()) throw new PayrollInputError(`${label} tidak valid: "${value}"`);
  return amount;
}

function bracketsOf(input: Pph21Input, kind: TaxRateKind): TaxBracket[] {
  const table = input.regulations.taxTables.find((t) => t.kind === kind);
  if (!table || table.brackets.length === 0) throw new PayrollInputError(`Tabel tarif ${kind} tidak tersedia untuk periode ini`);
  return table.brackets;
}

// TER: tarif flat dari lapis pertama yang batasnya ≥ bruto
function terRate(brackets: readonly TaxBracket[], gross: Money): string {
  const bracket = brackets.find((b) => b.incomeUpTo === null || gross.lte(money(b.incomeUpTo)));
  if (!bracket) throw new PayrollInputError("Tabel TER tidak memiliki lapis untuk penghasilan ini");
  return bracket.ratePercent;
}

// Pasal 17: tarif marginal per lapis atas PKP setahun
function progressiveTax(brackets: readonly TaxBracket[], taxable: Money, steps: string[]): Money {
  let tax = ZERO;
  let lower = ZERO;
  for (const bracket of brackets) {
    if (taxable.lte(lower)) break;
    const upper = bracket.incomeUpTo === null ? taxable : Money.min(taxable, money(bracket.incomeUpTo));
    const portion = upper.minus(lower);
    const part = portion.times(money(bracket.ratePercent)).div(100);
    steps.push(`  ${percent(bracket.ratePercent)} × ${rupiah(portion)} = ${rupiah(part)}`);
    tax = tax.plus(part);
    if (bracket.incomeUpTo === null) break;
    lower = money(bracket.incomeUpTo);
  }
  return roundRupiah(tax);
}

export function calculatePph21(input: Pph21Input): Pph21Result {
  const { ptkpStatus, month, current, regulations } = input;
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new PayrollInputError(`Masa pajak harus 1–12 (diterima ${month})`);

  const ptkp = regulations.ptkp.find((p) => p.status === ptkpStatus);
  if (!ptkp) throw new PayrollInputError(`PTKP ${ptkpStatus} tidak tersedia untuk periode ini`);
  const gross = nonNegative(current.grossIncome, "Penghasilan bruto");
  const pension = nonNegative(current.pensionContribution, "Iuran pensiun");
  const religious = nonNegative(current.religiousContribution, "Zakat/sumbangan keagamaan");
  const steps: string[] = [];
  const warnings: string[] = [];
  const finalPeriod = month === 12 || input.endsEmployment;

  if (!finalPeriod) {
    const ratePercent = terRate(bracketsOf(input, ptkp.terKind), gross);
    const tax = roundRupiah(gross.times(money(ratePercent)).div(100));
    steps.push(`Status PTKP ${ptkpStatus} → TER kategori ${ptkp.terKind.slice(-1).toUpperCase()}`);
    steps.push(`Penghasilan bruto ${rupiah(gross)} → tarif ${percent(ratePercent)}`);
    steps.push(`PPh 21 = ${percent(ratePercent)} × ${rupiah(gross)} = ${rupiah(tax)}`);
    return {
      method: "ter",
      ptkpStatus,
      terKind: ptkp.terKind,
      grossIncome: toMoneyString(gross),
      terRatePercent: ratePercent,
      annual: null,
      pph21: toMoneyString(tax),
      steps,
      warnings,
    };
  }

  // Masa pajak terakhir: penghitungan setahun
  const seen = new Set<number>();
  for (const period of input.previousPeriods) {
    if (!Number.isInteger(period.month) || period.month < 1 || period.month >= month) {
      throw new PayrollInputError(`Masa sebelumnya harus di antara 1 dan ${month - 1} (diterima ${period.month})`);
    }
    if (seen.has(period.month)) throw new PayrollInputError(`Masa ${period.month} tercatat lebih dari sekali`);
    seen.add(period.month);
  }
  const periods = [
    ...input.previousPeriods.map((p) => ({
      gross: nonNegative(p.grossIncome, `Bruto masa ${p.month}`),
      pension: nonNegative(p.pensionContribution, `Iuran pensiun masa ${p.month}`),
      religious: nonNegative(p.religiousContribution, `Zakat masa ${p.month}`),
      // Bisa negatif bila masa itu mengembalikan kelebihan potong
      withheld: amountOf(p.pph21Withheld, `PPh 21 masa ${p.month}`),
    })),
    { gross, pension, religious, withheld: ZERO },
  ];
  const monthsWorked = periods.length;
  const sumOf = (pick: (p: (typeof periods)[number]) => Money): Money => periods.reduce((total, p) => total.plus(pick(p)), ZERO);

  const annualGross = sumOf((p) => p.gross);
  const annualPension = sumOf((p) => p.pension);
  const annualReligious = sumOf((p) => p.religious);
  const withheldHere = sumOf((p) => p.withheld);

  const costRate = money(regulations.pph21.occupationalCostRatePercent);
  const costCap = Money.min(money(regulations.pph21.occupationalCostMonthlyMax).times(monthsWorked), money(regulations.pph21.occupationalCostAnnualMax));
  const occupationalCost = roundRupiah(Money.min(annualGross.times(costRate).div(100), costCap));
  const netHere = annualGross.minus(occupationalCost).minus(annualPension).minus(annualReligious);

  const previousNet = input.previousEmployer ? amountOf(input.previousEmployer.netIncome, "Neto pemberi kerja sebelumnya") : ZERO;
  const previousWithheld = input.previousEmployer ? amountOf(input.previousEmployer.pph21Withheld, "PPh 21 pemberi kerja sebelumnya") : ZERO;
  const ptkpAmount = money(ptkp.annualAmount);
  const totalNet = netHere.plus(previousNet);
  const taxable = Money.max(totalNet.minus(ptkpAmount), ZERO).div(THOUSAND).floor().times(THOUSAND);

  steps.push(`Masa pajak terakhir (${month === 12 ? "Desember" : "berhenti bekerja"}) — penghitungan setahun, ${monthsWorked} bulan bekerja`);
  steps.push(`Penghasilan bruto setahun ${rupiah(annualGross)}`);
  steps.push(
    `Biaya jabatan ${percent(regulations.pph21.occupationalCostRatePercent)} × ${rupiah(annualGross)}, maks ${rupiah(costCap)} = ${rupiah(occupationalCost)}`,
  );
  steps.push(`Iuran JHT/JP pegawai ${rupiah(annualPension)}`);
  if (!annualReligious.isZero()) steps.push(`Zakat/sumbangan keagamaan wajib ${rupiah(annualReligious)}`);
  steps.push(`Penghasilan neto ${rupiah(netHere)}`);
  if (input.previousEmployer) steps.push(`Neto pemberi kerja sebelumnya ${rupiah(previousNet)} → neto setahun ${rupiah(totalNet)}`);
  steps.push(`PTKP ${ptkpStatus} ${rupiah(ptkpAmount)}`);
  steps.push(`Penghasilan kena pajak (dibulatkan ke bawah ribuan) ${rupiah(taxable)}`);
  steps.push("PPh 21 setahun (tarif Pasal 17):");
  const annualTax = progressiveTax(bracketsOf(input, "pasal_17"), taxable, steps);
  steps.push(`PPh 21 setahun ${rupiah(annualTax)}`);

  const tax = annualTax.minus(withheldHere).minus(previousWithheld);
  steps.push(`Sudah dipotong masa sebelumnya ${rupiah(withheldHere)}`);
  if (input.previousEmployer) steps.push(`Sudah dipotong pemberi kerja sebelumnya ${rupiah(previousWithheld)}`);
  steps.push(`PPh 21 masa ini = ${rupiah(annualTax)} − ${rupiah(withheldHere.plus(previousWithheld))} = ${rupiah(tax)}`);
  if (tax.isNegative()) warnings.push(`Kelebihan potong PPh 21 ${rupiah(tax.abs())} — dikembalikan ke pegawai`);
  // Wajar untuk pegawai yang mulai bekerja tengah tahun; masa yang tertinggal membuat batas biaya jabatan & potongan salah
  if (input.previousPeriods.length < month - 1) {
    warnings.push(
      `Hanya ${input.previousPeriods.length} dari ${month - 1} masa sebelumnya tercatat — pastikan pegawai memang mulai bekerja tengah tahun`,
    );
  }

  return {
    method: "annual",
    ptkpStatus,
    terKind: ptkp.terKind,
    grossIncome: toMoneyString(gross),
    terRatePercent: null,
    annual: {
      monthsWorked,
      grossIncome: toMoneyString(annualGross),
      occupationalCost: toMoneyString(occupationalCost),
      pensionContribution: toMoneyString(annualPension),
      religiousContribution: toMoneyString(annualReligious),
      netIncome: toMoneyString(netHere),
      previousEmployerNetIncome: toMoneyString(previousNet),
      ptkp: toMoneyString(ptkpAmount),
      taxableIncome: toMoneyString(taxable),
      annualTax: toMoneyString(annualTax),
      withheldThisEmployer: toMoneyString(withheldHere),
      withheldPreviousEmployer: toMoneyString(previousWithheld),
    },
    pph21: toMoneyString(tax),
    steps,
    warnings,
  };
}
