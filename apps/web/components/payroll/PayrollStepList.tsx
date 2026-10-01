type Props = {
  steps: string[];
  label?: string;
};

// Langkah perhitungan dari payroll-engine, terlipat (<details>) agar rincian tetap ringkas
export function PayrollStepList({ steps, label = "Lihat perhitungan" }: Props) {
  if (steps.length === 0) return null;
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center text-small font-bold text-accent-strong select-none hover:text-accent-hover [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">{label}</span>
        <span className="hidden group-open:inline">Sembunyikan perhitungan</span>
      </summary>
      <ul className="mt-1.5 flex flex-col gap-0.5 rounded-inner bg-fill-subtle px-3.5 py-2.5 text-small text-text-secondary tabular-nums">
        {steps.map((step, index) => (
          // Langkah bisa sama persis (mis. dua komponen bernominal sama) — indeks sebagai pembeda
          <li key={`${index}-${step}`} className="whitespace-pre-wrap">
            {step}
          </li>
        ))}
      </ul>
    </details>
  );
}
