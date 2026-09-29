# UI Workflow — Aturan Wajib Sebelum Membuat UI

Dokumen ini adalah **gerbang wajib** untuk semua pekerjaan UI. Claude Code tidak boleh membuat halaman atau component apapun tanpa melewati workflow ini. Tujuannya: hasil UI konsisten dengan desain yang diinginkan user, bukan hasil "selera default" AI.

---

## Prinsip

1. **Desain adalah source of truth.** Referensi visual (screenshot, export Figma) selalu menang atas asumsi.
2. **Tidak ada referensi = tidak ada UI.** Lebih baik bertanya sekali daripada generate halaman yang harus dibuang.
3. **Registry sebelum inovasi.** Component yang mirip sudah ada? Pakai/extend yang ada, jangan bikin varian baru.

---

## Checklist Wajib (jalankan berurutan)

### Step 1 — Cari referensi desain

Cek `context/designs/`:

- Format nama file: `<nama-halaman>.png` atau `<nama-halaman>-<bagian>.png`
  Contoh: `dashboard.png`, `login.png`, `profile-form.png`
- Jika ada beberapa breakpoint: `dashboard-mobile.png`, `dashboard-desktop.png`

**Ditemukan?** → Buka dan amati file gambarnya (Claude Code bisa membaca file image). Ekstrak: layout, hierarchy, spacing, komponen yang terlihat. Lanjut ke Step 2.

**Tidak ditemukan?** → **BERHENTI.** Tanyakan ke user dengan template ini:

> Saya tidak menemukan referensi desain untuk **[nama halaman/component]** di `context/designs/`.
> Pilih salah satu:
> 1. Upload screenshot/gambar desain ke `context/designs/[nama].png`
> 2. Berikan link Figma / referensi website yang mau ditiru gayanya
> 3. Izinkan saya build hanya berdasarkan `ui-rules.md` + `ui-tokens.md` (hasil mungkin perlu revisi visual)

Jangan lanjut sampai user menjawab. Jika user memilih opsi 3, catat di `progress-tracker.md` bagian *Decisions* bahwa halaman tersebut dibuat tanpa referensi visual.

### Step 2 — Cek ui-registry.md

- Component serupa sudah ada? → **Pakai component yang sama / extend props-nya.** Dilarang membuat duplikat dengan nama beda.
- Belum ada? → Lanjut ke Step 3.

### Step 3 — Baca aturan visual

- `ui-rules.md` — pola layout, card, typography, button, form, empty state
- `ui-tokens.md` — semua warna, font, spacing. **Dilarang hardcode hex atau memakai kelas warna bawaan Tailwind.**

### Step 4 — Build

- Ikuti struktur component di `code-standards.md`
- Mock data dulu jika logic backend belum ada — UI harus bisa diverifikasi visual sebelum wiring data
- Satu component per file, named export

### Step 5 — Update registry

Setelah component selesai, tambahkan entry di `ui-registry.md`:

```markdown
### NamaComponent
- **Path:** apps/web/components/dashboard/NamaComponent.tsx
- **Dipakai di:** /dashboard
- **Referensi desain:** context/designs/dashboard.png
- **Pola kelas kunci:** bg-surface border border-border rounded-2xl p-6
- **Catatan:** (varian, props penting, batasan)
```

---

## Kapan Boleh Skip Step 1?

Hanya jika **semua** kondisi ini terpenuhi:

- Component adalah primitive murni dari shadcn/ui tanpa modifikasi visual (mis. install `Button` bawaan), ATAU
- User secara eksplisit dalam pesan yang sama mengatakan "tanpa referensi, pakai ui-rules saja"

Perintah singkat seperti "buatkan halaman settings" **BUKAN** izin skip. Tetap jalankan Step 1.

---

## Aturan Konsistensi Antar-Session

Claude Code tidak punya memori antar session. Registry adalah memorinya. Karena itu:

- Registry yang tidak di-update = component hantu yang akan diduplikasi di session berikutnya
- Setiap selesai kerja UI, jalankan `/update-context` sebelum mengakhiri session
