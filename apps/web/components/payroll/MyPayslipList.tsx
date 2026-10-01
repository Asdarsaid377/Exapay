import { formatRupiah, type MyPayslip } from "@exapay/shared";
import { Download } from "lucide-react";

import { buttonClassName } from "@/components/common/Button";
import { MaskedAmount } from "@/components/payroll/MaskedAmount";
import { runPeriodSummary, runTitle } from "@/lib/payrollRunLabels";
import { myPayslipPdfHref } from "@/lib/payslipLabels";

type Props = {
  payslips: MyPayslip[];
};

// Slip gaji milik sendiri (portal, feature 31): satu card solid per bulan — gaji diterima tersamar + unduh PDF.
// Tanpa referensi desain halaman ini — pola kartu "Slip gaji terakhir" me.html + MyLeaveRequestList (izin user).
export function MyPayslipList({ payslips }: Props) {
  return (
    <ul className="flex flex-col gap-3">
      {payslips.map((payslip) => (
        <li key={payslip.id} className="surface-solid flex flex-col gap-2 rounded-card px-4.5 py-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">{runTitle(payslip)}</h2>
            <span className="text-small text-text-secondary tabular-nums">{runPeriodSummary(payslip)}</span>
          </div>
          <div className="flex flex-col gap-0.5 border-t border-border-subtle pt-2">
            <span className="text-[13px] text-text-secondary">Gaji diterima</span>
            <MaskedAmount value={formatRupiah(payslip.takeHomePay)} label={`gaji diterima ${runTitle(payslip)}`} />
          </div>
          <a href={myPayslipPdfHref(payslip.id)} target="_blank" rel="noopener" className={buttonClassName({ variant: "secondary", size: "lg", fullWidth: true })}>
            <Download aria-hidden className="size-4.5" />
            Unduh slip PDF
          </a>
        </li>
      ))}
    </ul>
  );
}
