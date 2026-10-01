import { formatRupiah, type MyPayslip } from "@exapay/shared";

import { MaskedAmount } from "@/components/payroll/MaskedAmount";
import { monthLabel } from "@/lib/attendanceLabels";

type Props = {
  payslip: MyPayslip;
};

// Tile "Slip gaji terakhir · <bulan>" di beranda portal — snapshot context/designs/me.html (selebar grid, nominal tersamar
// dengan Lihat/Sembunyikan). Daftar & unduh PDF lewat menu Slip.
export function LatestPayslipTile({ payslip }: Props) {
  const month = monthLabel(payslip.month);
  return (
    <div className="surface-solid col-span-2 flex min-h-16 flex-col gap-0.75 rounded-[20px] px-4 py-3">
      <span className="text-[13px] text-text-secondary">Slip gaji terakhir · {month}</span>
      <MaskedAmount value={formatRupiah(payslip.takeHomePay)} label={`gaji diterima ${month}`} />
    </div>
  );
}
