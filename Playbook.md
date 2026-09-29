# Playbook — Tahapan Prompt Memulai Project Baru

Panduan langkah demi langkah (beserta prompt siap-copy) untuk memulai project baru dari starter ini bersama Claude Code. Ulangi playbook ini di setiap project.

Simpan file ini di root starter (mis. `PLAYBOOK.md`) agar selalu terbawa saat starter di-copy.

---

## Tahap 0 — Persiapan (di luar Claude Code)

1. Copy seluruh folder starter sebagai root project baru:
   ```bash
   cp -r project-starter/ nama-project-baru/
   cd nama-project-baru
   git init
   ```
2. Pastikan Docker + Docker Compose, Node.js LTS, dan pnpm terpasang. Postgres & Redis dijalankan lewat Docker Compose (dibuat di feature 01).
3. Buka Claude Code di root project.

> Jangan lewati Tahap 1–2 langsung ke coding. Urutan playbook ini adalah bagian dari sistemnya.

---

## Tahap 1 — Brainstorming & PRD

**Prompt:**

```
/plan-app [tulis ide kasar aplikasi kamu di sini, 1-3 kalimat]
```

Contoh:

```
/plan-app Aplikasi kasir untuk UMKM kuliner: pencatatan penjualan harian, stok bahan sederhana, dan laporan laba rugi mingguan. Multi-outlet nantinya, tapi MVP satu outlet dulu.
```

Yang terjadi: Claude mewawancarai kamu (masalah, user, alur, MVP vs nanti, data, batasan), merangkum, minta konfirmasi, lalu mengisi `project-overview.md`, `build-plan.md`, dan `progress-tracker.md`.

**Checklist keluar tahap ini:**

- [ ] `context/project-overview.md` terisi, bagian Out of Scope tidak kosong
- [ ] `context/build-plan.md` berisi feature bernomor
- [ ] Kamu sudah membaca ulang keduanya dan setuju (revisi di sini murah, revisi setelah coding mahal)

---

## Tahap 2 — Referensi Desain & Token

1. Siapkan desain halaman pertama (export Figma / screenshot referensi) → taruh di `context/designs/` dengan nama sesuai route (`landing.png`, `login.png`, `dashboard.png`).
2. Minta Claude mengekstrak token dari desain:

**Prompt:**

```
Baca semua file di context/designs/. Ekstrak design tokens dari desain tersebut (warna, font, radius, spacing yang berulang) lalu update context/ui-tokens.md dan sesuaikan context/ui-rules.md dengan pola yang terlihat di desain. Tunjukkan hasilnya ke saya sebelum menyimpan, dan tandai nilai yang kamu tidak yakin agar saya konfirmasi.
```

**Checklist keluar tahap ini:**

- [ ] `ui-tokens.md` berisi hex asli dari desain, bukan nilai template
- [ ] `ui-rules.md` tidak lagi berisi tanda `[SESUAIKAN]` untuk pola yang sudah terlihat di desain
- [ ] Minimal desain untuk feature 01–02 sudah ada di `designs/`

> Belum punya desain sama sekali? Tunda tahap ini, dan saat `/new-feature` nanti pilih opsi "build berdasarkan ui-rules default" secara eksplisit — keputusan itu akan tercatat di progress-tracker. Konsekuensinya: hampir pasti ada revisi visual.

---

## Tahap 3 — Setup Project (Feature 01)

**Prompt:**

```
/new-feature 01
```

Ini akan meng-init monorepo (NestJS api, Next.js web, worker), Docker Compose (postgres, redis), dan globals.css berisi token. Setelah selesai, isi `.env` berdasarkan `.env.example` (Claude tidak boleh dan tidak perlu tahu isinya), lalu verifikasi:

**Prompt verifikasi:**

```
Jalankan dev server dan pastikan halaman kosong tampil dengan background token yang benar. Laporkan error jika ada, jangan diperbaiki diam-diam.
```

---

## Tahap 4 — Loop Utama Pengerjaan Feature

Ulangi pola ini untuk setiap feature di build-plan sampai MVP selesai:

**1. Mulai session baru per feature** (context bersih = hasil lebih konsisten):

```
/new-feature [nomor]
```

**2. Jika Claude berhenti minta referensi desain** — itu by design. Jawab dengan salah satu:

- "Sudah saya taruh di context/designs/[nama].png, lanjutkan"
- "Build berdasarkan ui-rules saja, saya sadar konsekuensinya"

**3. Verifikasi hasil secara visual/fungsional.** Jangan bilang "ok lanjut" tanpa benar-benar membuka halamannya.

**4. Jika butuh perubahan schema database, jangan biarkan inline** — arahkan:

```
/db-change [deskripsi perubahan, mis: tabel transactions dengan relasi ke outlets]
```

**5. Tutup setiap sesi kerja dengan:**

```
/update-context
```

**Checklist per feature:**

- [ ] Feature terverifikasi olehmu (bukan hanya klaim Claude)
- [ ] `progress-tracker.md` ter-update
- [ ] Component baru tercatat di `ui-registry.md`
- [ ] Commit git dibuat

---

## Tahap 5 — Prompt Situasional (pakai saat dibutuhkan)

**Melanjutkan kerja di session baru:**

```
Baca context/progress-tracker.md lalu lanjutkan dari posisi terakhir. Konfirmasi dulu ke saya apa yang akan kamu kerjakan sebelum mulai.
```

**Ada bug:**

```
Bug: [gejala]. Langkah reproduksi: [langkah]. Error log: [paste log].
Cari akar masalahnya dulu dan jelaskan sebelum memperbaiki. Perbaikan hanya pada akar masalah — jangan refactor hal lain.
```

**Claude mulai melenceng dari standar (pattern drift):**

```
Berhenti. Baca ulang CLAUDE.md dan context/code-standards.md, lalu audit perubahan yang baru kamu buat terhadap standar tersebut. Laporkan pelanggarannya dan perbaiki.
```

**Menambah library baru:**

```
Saya mau pakai [library] untuk [kebutuhan]. Sebelum install: cek versi terbarunya, konfirmasi API-nya dari dokumentasi resmi (jangan dari ingatan), sebutkan trade-off-nya, lalu setelah terpasang tambahkan entry di context/library-docs.md.
```

**Revisi visual setelah melihat hasil:**

```
Halaman [route] belum sesuai desain context/designs/[file].png. Bandingkan hasil render dengan desain, sebutkan perbedaannya satu per satu, lalu perbaiki. Jangan mengubah component lain yang tidak terkait.
```

---

## Anti-Pattern (jangan lakukan)

- ❌ Memberi prompt "buatkan seluruh aplikasinya sekaligus" — sistem ini dirancang per-feature; prompt borongan menghasilkan kode banyak yang tidak terverifikasi
- ❌ Membiarkan session sangat panjang lintas banyak feature — mulai session baru per feature, dokumen hidup adalah memorinya
- ❌ Menyetujui hasil tanpa membuka halamannya
- ❌ Mengizinkan perubahan schema tanpa `/db-change`
- ❌ Menutup sesi tanpa `/update-context` — session berikutnya akan buta dan menduplikasi component

---

## Ringkasan Alur

```
Tahap 0  copy starter + git init + siapkan Docker/Node/pnpm
Tahap 1  /plan-app → PRD terisi & dikonfirmasi
Tahap 2  desain masuk designs/ → ekstrak ui-tokens
Tahap 3  /new-feature 01 → setup terverifikasi
Tahap 4  loop: /new-feature N → verifikasi → (/db-change) → /update-context → commit
Tahap 5  prompt situasional sesuai kebutuhan
```
