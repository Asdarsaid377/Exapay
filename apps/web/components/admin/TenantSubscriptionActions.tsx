"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { extendTenantTrial, setTenantComplimentary, setTenantPrice } from "@/actions/adminBilling";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { MoneyField } from "@/components/common/MoneyField";
import { TextField } from "@/components/common/TextField";
import type { AdminActionOutcome } from "@/lib/adminOutcomes";

type Props = {
  tenantId: string;
  tenantName: string;
  // Status tersimpan: trial hanya bisa diberikan bila belum berlangganan berbayar
  baseStatus: "trialing" | "active" | "complimentary";
  pricePerEmployeeOverride: string | null;
  minBilledEmployeesOverride: number | null;
  defaultTrialDays: number;
};

type Mode = "trial" | "complimentary" | "price" | null;

// Kelola langganan satu usaha di /admin/tenants/[id] (feature 42): beri/perpanjang trial, jadikan gratis (pilot),
// harga khusus. Tanpa referensi desain — pola TenantStatusActions (Dialog per aksi), izin user.
export function TenantSubscriptionActions({ tenantId, tenantName, baseStatus, pricePerEmployeeOverride, minBilledEmployeesOverride, defaultTrialDays }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [days, setDays] = useState(String(defaultTrialDays));
  const [price, setPrice] = useState(pricePerEmployeeOverride?.replace(/\.00$/, "") ?? "");
  const [minimum, setMinimum] = useState(minBilledEmployeesOverride === null ? "" : String(minBilledEmployeesOverride));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setMode(null);
    setError(null);
  }

  async function run(action: () => Promise<AdminActionOutcome>) {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await action();
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      close();
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  function submitTrial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(() => extendTenantTrial(tenantId, Number(days)));
  }

  function submitPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minBilled = minimum.trim() === "" ? null : Number(minimum);
    if (minBilled !== null && (!Number.isInteger(minBilled) || minBilled < 0)) {
      setError("Minimum ditagih harus bilangan bulat 0 atau lebih");
      return;
    }
    void run(() => setTenantPrice(tenantId, { pricePerEmployee: price === "" ? null : price, minBilledEmployees: minBilled }));
  }

  const footer = (label: string, formId?: string, onClick?: () => void) => (
    <>
      <Button variant="secondary" onClick={close} disabled={submitting}>
        Batal
      </Button>
      <Button type={formId ? "submit" : "button"} form={formId} onClick={onClick} loading={submitting}>
        {label}
      </Button>
    </>
  );

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {baseStatus !== "active" ? (
          <Button variant="secondary" onClick={() => setMode("trial")}>
            {baseStatus === "trialing" ? "Perpanjang trial" : "Beri trial"}
          </Button>
        ) : null}
        {baseStatus !== "complimentary" ? (
          <Button variant="secondary" onClick={() => setMode("complimentary")}>
            Jadikan gratis (pilot)
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => setMode("price")}>
          Harga khusus
        </Button>
      </div>

      <Dialog
        open={mode === "trial"}
        onClose={close}
        dismissible={!submitting}
        title={baseStatus === "trialing" ? "Perpanjang trial" : "Beri trial"}
        description={
          baseStatus === "trialing"
            ? `Ditambahkan ke akhir trial ${tenantName} (atau dari hari ini bila trial sudah berakhir).`
            : `${tenantName} berubah dari gratis (pilot) menjadi trial mulai hari ini, lalu ditagih setelah trial berakhir.`
        }
        footer={footer("Simpan", "trial-form")}
      >
        <form id="trial-form" noValidate onSubmit={submitTrial} className="flex flex-col gap-4">
          {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
          <TextField id="trial-days-input" label="Jumlah hari" type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(event) => setDays(event.target.value)} disabled={submitting} />
        </form>
      </Dialog>

      <Dialog
        open={mode === "complimentary"}
        onClose={close}
        dismissible={!submitting}
        title={`Jadikan ${tenantName} gratis (pilot)?`}
        description="Usaha ini tidak akan ditagih dan tidak pernah masuk mode baca-saja. Tagihan yang belum dibayar dibatalkan; laporan bayar yang menunggu konfirmasi tetap diputuskan seperti biasa."
        footer={footer("Jadikan gratis", undefined, () => void run(() => setTenantComplimentary(tenantId)))}
      >
        {error ? <FormAlert tone="danger">{error}</FormAlert> : <span className="sr-only">Konfirmasi</span>}
      </Dialog>

      <Dialog
        open={mode === "price"}
        onClose={close}
        dismissible={!submitting}
        title="Harga khusus"
        description="Berlaku untuk tagihan yang terbit setelah disimpan. Kosongkan untuk mengikuti harga platform."
        footer={footer("Simpan", "price-form")}
      >
        <form id="price-form" noValidate onSubmit={submitPrice} className="flex flex-col gap-4">
          {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
          <MoneyField id="override-price" label="Harga per karyawan aktif / bulan" value={price} onChange={setPrice} placeholder="Ikut harga platform" disabled={submitting} />
          <TextField
            id="override-minimum"
            label="Minimum ditagih"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Ikut harga platform"
            value={minimum}
            onChange={(event) => setMinimum(event.target.value)}
            hint="karyawan"
            disabled={submitting}
          />
        </form>
      </Dialog>
    </>
  );
}
