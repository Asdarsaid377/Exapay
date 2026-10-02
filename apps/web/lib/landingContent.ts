// Isi landing page `/` (feature 43) — teks dari snapshot context/designs/landing.html + revisi "mulai dari kondisi usaha"
// (permintaan user 2026-10-02). Setiap klaim harus sesuai fitur yang sudah ada; harga & lama trial TIDAK ditulis di sini
// (diambil dari data harga berlaku lewat GET /billing/public/price).

// Kontak publik — placeholder sampai user memberi alamat resmi
export const LANDING_CONTACT = {
  email: "halo@exapay.id",
  whatsappLabel: "+62 812-0000-0000",
  whatsappHref: "https://wa.me/6281200000000",
} as const;

export const LANDING_ANCHORS = [
  { label: "Fitur", href: "#fitur" },
  { label: "Cara kerja", href: "#cara-kerja" },
  { label: "Harga", href: "#harga" },
  { label: "FAQ", href: "#faq" },
] as const;

export const LANDING_PROBLEMS = [
  {
    before: "Gaji, BPJS & PPh 21 dihitung manual di Excel, padahal aturannya sering berubah.",
    after: "Dihitung otomatis memakai aturan yang berlaku pada tanggal periode gaji.",
  },
  {
    before: "Tugas dikoordinasi lewat WhatsApp. Tidak ada data siapa yang kinerjanya bagus.",
    after: "Tugas harian tercatat dan diverifikasi atasan, jadi skor kinerja yang bisa dijelaskan.",
  },
  {
    before: "Absensi dicatat manual, potongan gaji tidak konsisten antar karyawan.",
    after: "Absen dari HP. Potongan mengikuti aturan yang Anda tetapkan, lengkap dengan penjelasannya.",
  },
  {
    before: "Tenggat setor BPJS dan PPh 21, kontrak habis, atau masa percobaan sering terlupa.",
    after: "Pengingat di dashboard dan email, H-7 dan H-1.",
  },
] as const;

// Revisi: UMKM yang belum menjalankan semua regulasi tetap bisa memakai Exapay. PPh 21 TIDAK bisa dimatikan —
// klaimnya hanya "hasilnya Rp0 di bawah batas kena pajak" (TER 0%).
export const LANDING_START_POINTS = [
  {
    title: "Mulai dari yang Anda perlukan",
    body: "Pakai absensi dan tugas harian lebih dulu, payroll menyusul saat Anda siap. Tidak perlu menyiapkan semuanya di hari pertama.",
  },
  {
    title: "BPJS diatur per karyawan",
    body: "Pilih program yang diikuti tiap karyawan — Kesehatan, JHT, JP, JKK, JKM — atau belum sama sekali. Ubah kapan saja setelah mendaftar.",
  },
  {
    title: "PPh 21 dihitung otomatis",
    body: "Untuk gaji di bawah batas penghasilan kena pajak, hasilnya Rp0. Anda tetap tahu kapan karyawan mulai kena pajak.",
  },
  {
    title: "Peringatan UMK bisa dimatikan",
    body: "Tidak ada tanda merah yang mengganggu bila Anda belum siap. Nyalakan saat ingin mulai memantau.",
  },
  {
    title: "Potongan absensi sesuai kebijakan Anda",
    body: "Termasuk pilihan “tidak dipotong” untuk alpa, telat, maupun izin.",
  },
] as const;

export const LANDING_FEATURE_POINTS = {
  payroll: [
    "Komponen gaji, BPJS Kesehatan & Ketenagakerjaan dengan batas upah",
    "PPh 21 TER bulanan, dihitung ulang otomatis di bulan Desember",
    "Draf → review → final terkunci; slip PDF ke email, ekspor Excel untuk transfer bank",
  ],
  attendance: ["Absen masuk dan pulang dengan waktu server", "Izin, sakit, dan cuti dengan persetujuan atasan", "Potongan alpa dan telat sesuai kebijakan usaha Anda"],
  kpi: [
    "Karyawan mencatat realisasi indikator setiap hari",
    "Atasan memverifikasi — hanya tugas terverifikasi yang dihitung",
    "Ringkasan kinerja dibantu AI, selalu ditinjau atasan sebelum final",
  ],
  compliance: ["Kalender setor BPJS & PPh 21", "Kontrak habis dan akhir masa percobaan", "Peringatan gaji pokok di bawah UMK kota Anda"],
  portal: ["Absen dan catat tugas harian", "Ajukan izin, sakit, atau cuti", "Lihat slip gaji dan skor sendiri"],
} as const;

export const LANDING_STEPS = [
  {
    n: "1",
    title: "Daftar dan isi profil usaha",
    body: "Kota (untuk UMK) dan tanggal gajian. Aturan BPJS, PPh 21, jadwal kerja, dan template KPI bawaan langsung siap.",
  },
  { n: "2", title: "Tambah karyawan", body: "Isi satu per satu atau impor dari Excel, lalu undang mereka ke portal karyawan." },
  {
    n: "3",
    title: "Setiap bulan: tinjau, finalkan",
    body: "Draf gaji sudah dihitung. Tinjau, finalisasi, dan slip terkirim otomatis ke email karyawan.",
  },
] as const;

export const LANDING_INCLUDED = [
  "Semua modul",
  "Owner, admin & atasan tanpa batas",
  "Portal karyawan",
  "Slip gaji PDF & email",
  "Ekspor Excel",
  "Pembaruan aturan BPJS, PPh 21 & UMK",
  "Cocok untuk usaha mulai 1 karyawan",
] as const;

export type LandingFaq = { q: string; a: string };

// trialDays dari data harga berlaku; null = harga belum bisa dimuat
export function landingFaqs(trialDays: number | null): LandingFaq[] {
  const trial = trialDays === null ? "trial" : `trial ${trialDays} hari`;
  return [
    {
      q: "Apakah Exapay hanya untuk perusahaan besar?",
      a: "Tidak. Exapay dibuat untuk UMKM — kedai, toko, bengkel, klinik kecil, atau usaha lain dengan beberapa sampai puluhan karyawan, yang belum punya orang HR. Anda bisa mulai dari 1 karyawan dan dari kondisi usaha Anda sekarang, termasuk bila belum semua aturan penggajian dijalankan.",
    },
    {
      q: "Apakah perhitungan PPh 21 sudah sesuai aturan terbaru?",
      a: "Ya. Potongan bulanan memakai tarif efektif rata-rata (TER) sesuai PMK 168/2023, lalu dihitung ulang dengan tarif Pasal 17 di bulan Desember. Setiap aturan disimpan dengan tanggal berlakunya, jadi slip lama tetap memakai aturan pada saat itu.",
    },
    {
      q: "Usaha saya belum memotong PPh 21 dan belum semua karyawan ikut BPJS. Bisa pakai Exapay?",
      a: "Bisa. Kepesertaan BPJS diatur per karyawan dan per program, jadi karyawan yang belum terdaftar tidak dipotong. PPh 21 dihitung otomatis — untuk gaji di bawah batas penghasilan kena pajak hasilnya Rp0. Peringatan UMK bisa dimatikan, dan potongan absensi bisa diatur “tidak dipotong”. Saat usaha tumbuh, aturan bisa dirapikan satu per satu.",
    },
    {
      q: "Apakah data karyawan aman?",
      a: "NIK, NPWP, dan nomor rekening disimpan terenkripsi dan ditampilkan tersamar. Akses diatur per peran — atasan hanya melihat bawahannya. Perubahan data penting tercatat: siapa, kapan, dan apa yang diubah.",
    },
    {
      q: "Apakah Exapay mentransfer gaji?",
      a: "Tidak. Exapay tidak memegang uang Anda. Setelah payroll final, unduh file Excel berisi nama, bank, nomor rekening, dan nominal untuk transfer lewat internet banking.",
    },
    {
      q: `Apa yang terjadi setelah ${trial}?`,
      a: "Bayar tagihan bulan pertama untuk lanjut. Kalau belum dibayar, data tidak dihapus — akun menjadi baca-saja sampai tagihan dibayar.",
    },
    {
      q: "Bagaimana cara bayar?",
      a: "Lewat QRIS, bisa dari semua e-wallet dan m-banking. Pembayaran dikonfirmasi maksimal 1×24 jam, dan kuitansi dikirim ke email Anda.",
    },
    {
      q: "Apakah AI menentukan nilai karyawan?",
      a: "Tidak. Skor dihitung dari rumus yang bisa Anda lihat: realisasi dibanding target, dikali bobot tiap indikator. AI hanya membantu menulis draf ringkasan kinerja, dan atasan wajib meninjaunya sebelum final.",
    },
    {
      q: "Bisa dipakai karyawan lewat HP?",
      a: "Bisa. Portal karyawan dibuka dari browser HP dan bisa dipasang di layar utama seperti aplikasi. Karyawan bisa absen, mencatat tugas, mengajukan izin, serta melihat slip dan skornya sendiri.",
    },
  ];
}

// Label CTA utama — lama trial dari data harga berlaku
export function trialCtaLabel(trialDays: number | null): string {
  return trialDays === null || trialDays <= 0 ? "Coba gratis" : `Coba gratis ${trialDays} hari`;
}
