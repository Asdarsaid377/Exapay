# Project Brief: SaaS Payroll + Manajemen Karyawan + KPI Berbantuan AI (untuk UMKM)

Dokumen ini adalah acuan untuk eksekusi kode. Isinya hasil brainstorming: visi produk, positioning, target pasar, ruang lingkup versi pertama, keputusan arsitektur, dan hal yang belum diputuskan. Kalau ada konflik antara dokumen ini dan asumsi Claude Code, dokumen ini yang menang. Kalau ada hal yang tidak tercakup, tanyakan sebelum berasumsi.

---

## 1. Ringkasan produk

Aplikasi SaaS multi-tenant yang **membantu tugas HRD** di UMKM yang belum punya orang HR. Bukan pengganti HRD. Tanggung jawab dan keputusan akhir tetap di owner atau atasan; sistem memandu, menghitung, dan mengingatkan.

Pilar utama versi pertama:
1. **Payroll dasar** sesuai regulasi Indonesia.
2. **Tugas harian dan KPI** per karyawan, dengan AI sebagai pembantu penilai dan pembuat kesimpulan kinerja per periode.
3. **Kalender kepatuhan**: pengingat kewajiban (setor BPJS, PPh 21, kontrak hampir habis, masa percobaan selesai, perubahan UMK).

Diferensiasi utama dibanding kompetitor (Mekari Talenta, Gadjian, Sleekr, dll): modul **tugas harian ke KPI dengan AI** yang sederhana untuk UMKM, bukan payroll itu sendiri.

## 2. Target pengguna

- Segmen awal: UMKM dan perusahaan menengah dengan **karyawan di bawah 50 orang**.
- Pengambil keputusan: owner (sensitif harga, butuh onboarding mudah, percaya lewat rekomendasi).
- Pengguna sehari-hari: owner atau satu admin (bukan tim HR), atasan/supervisor, dan karyawan (kebanyakan hanya pakai HP).
- Persona: owner, admin, atasan, karyawan. Detail alur harian per persona belum dibahas (lihat bagian 9).

Implikasi produk:
- Onboarding cepat: impor karyawan lewat Excel, template komponen gaji siap pakai, aturan BPJS dan PPh 21 sudah terisi.
- Mobile-first untuk karyawan (PWA cukup di awal). Notifikasi WhatsApp dipertimbangkan.
- Pengaturan KPI sederhana: template per jabatan, bobot default, tanpa konfigurasi rumit.

## 3. Positioning dan pesan

- Framing: "alat bantu tugas HRD", bukan "HRD virtual" atau "pengganti HRD".
- Klaim dibatasi: "membantu dan memandu", bukan "menjamin sesuai hukum".
- Fitur yang menyentuh keputusan sensitif (SP, PHK, pesangon) diposisikan sebagai **kalkulator dan template referensi dengan disclaimer**, bukan rekomendasi keputusan.
- Pesan jual berorientasi hasil: tidak hitung gaji manual, tahu siapa yang kerja bagus, tidak telat setor BPJS dan pajak.

## 4. Ruang lingkup versi pertama (MVP)

Urutan build yang disarankan:
1. Master karyawan, tugas harian, skor KPI dasar.
2. Payroll dasar: gaji pokok, tunjangan, lembur, BPJS (Kesehatan dan Ketenagakerjaan: JHT, JP, JKK, JKM, dengan batas upah), PPh 21 skema TER (bulanan) plus true-up Desember, slip gaji PDF.
3. Ringkasan kinerja per periode dengan AI, dengan review atasan sebelum final.
4. Kalender kepatuhan (pengingat).
5. Adapter ERPNext dan ekspor ke sistem lain (setelah inti stabil).

Di luar MVP (ditunda): rekrutmen, asisten AI tanya-jawab hukum ketenagakerjaan, template dokumen HR lengkap (kontrak, SP, surat keterangan), onboarding/offboarding penuh, earned wage access/kasbon, pelaporan pajak otomatis (e-Bupot).

## 5. Stack teknis (sudah diputuskan)

- Backend: **NestJS**
- Database: **PostgreSQL**
- Frontend: **Next.js**
- Container: **Docker** (Docker Compose untuk development: api, web, postgres, redis)
- **Tidak memakai Frappe/ERPNext sebagai engine.** ERPNext hanya integrasi opsional lewat adapter.

Disarankan (belum final, konfirmasi saat implementasi):
- Monorepo pnpm + Turborepo agar tipe dan validasi dipakai bersama antara NestJS dan Next.js.
- BullMQ + Redis untuk proses latar belakang.
- Library desimal (misal decimal.js) untuk semua perhitungan uang.
- ORM/query builder: Prisma perlu perhatian ekstra untuk pola RLS; Drizzle atau query builder lebih fleksibel. Putuskan sebelum membuat skema.

## 6. Keputusan arsitektur

**Multi-tenancy**
- Satu database, satu skema, kolom `tenant_id` di semua tabel, diperkuat **Row Level Security PostgreSQL**.
- Tenant di-set per request lewat `set_config` di dalam transaksi. Jangan hanya mengandalkan filter di kode aplikasi.

**Mesin payroll**
- Modul perhitungan gaji **murni** (tanpa dependensi NestJS atau database) agar mudah diuji dengan banyak skenario.
- Uang selalu `numeric` di Postgres dan library desimal di kode. Tidak pernah float.
- Aturan regulasi (tabel TER, batas upah BPJS, UMK, tarif) disimpan **sebagai data dengan tanggal berlaku**, bukan hardcode.
- Setelah payroll difinalisasi: simpan **snapshot immutable** dan **audit log** (siapa mengubah apa).

**Proses latar belakang**
- Generate slip gaji PDF, ringkasan AI, sinkronisasi ERPNext, dan notifikasi WhatsApp berjalan lewat antrean, tidak memblokir request.

**AI (KPI dan ringkasan kinerja)**
- AI adalah pembantu penilai, **bukan penentu**. Skor dan kesimpulan harus bisa dijelaskan (berdasar tugas apa, bobot berapa) dan bisa dikoreksi atasan.
- Skor AI tidak boleh langsung memengaruhi gaji atau bonus tanpa review manusia.
- Lapisan abstraksi provider AI. Simpan input terstruktur, output, dan versi prompt.
- Status hasil: `draft` -> `direview` -> `final`.
- Kualitas skor bergantung pada kualitas tugas: pakai template tugas, bobot, dan target terukur, bukan hanya teks bebas.

**Integrasi ERPNext (opsional, belakangan)**
- Lapisan adapter terpisah lewat REST API; adapter lain (Accurate, Jurnal, dll) bisa ditambah tanpa mengubah inti.
- Data model sendiri; jangan meniru struktur Doctype Frappe.
- Arah sinkronisasi yang direncanakan: tarik master karyawan dan departemen dari ERPNext, dorong hasil payroll sebagai Journal Entry. Attendance dua arah jika klien punya.
- Simpan mapping ID eksternal per tenant. Sinkronisasi harus **idempotent**.

**Keamanan dan kepatuhan data**
- RBAC minimal: owner, admin, atasan, karyawan.
- Data sensitif (NIK, NPWP, nomor rekening) dienkripsi di level kolom (terkait UU PDP).
- Operasional awal: satu VPS, backup Postgres terjadwal ke luar server. Belum perlu Kubernetes.

## 7. Risiko yang harus diingat saat membangun

- **Kepatuhan regulasi**: aturan sering berubah; perlu uji hitung ketat dan proses update rutin. Salah hitung gaji merusak kepercayaan.
- **Skor AI dianggap subjektif** atau memicu rasa diawasi: transparansi dan review manusia wajib.
- **Kebocoran data karyawan**: dampak besar, ada kewajiban UU PDP.
- **Cakupan melebar**: jaga fokus pada tiga pilar MVP.
- **Risiko hukum saran ketenagakerjaan**: gunakan aturan terkurasi, disclaimer, dan framing kalkulator/referensi.

## 8. Gambaran pasar singkat (untuk konteks, perlu diverifikasi)

- Kompetitor: Mekari Talenta (menengah ke atas), Gadjian dan sejenisnya (UMKM), Sleekr, modul HR di software akuntansi. Kompetitor nyata lainnya: Excel + WhatsApp.
- Peluang: "KPI untuk UMKM", integrasi WhatsApp, kanal lewat akuntan/konsultan pajak/implementor ERP, kalender kepatuhan otomatis.
- Strategi validasi: uji dengan 5-10 UMKM nyata (dari basis klien pemilik proyek) sebelum membangun banyak fitur.
- Angka pasar dan harga kompetitor di atas belum diverifikasi.

## 9. Belum diputuskan (tanyakan ke pemilik proyek)

- Persona pengguna utama dan alur harian tiap peran (owner, admin, atasan, karyawan).
- ORM atau query builder final (Prisma vs Drizzle vs lainnya).
- Model harga (disarankan per karyawan per bulan, dengan minimum per tenant) dan detail paket.
- Provider AI yang dipakai dan batas biaya per tenant.
- Cara notifikasi WhatsApp (API resmi vs alternatif).
- Format dan skema KPI awal: struktur template tugas, bobot default, skala nilai, periode penilaian.
- Nama produk dan domain.

## 10. Langkah awal yang disarankan untuk Claude Code

Ini saran urutan kerja; konfirmasi dulu sebelum mengeksekusi.

1. Scaffold monorepo (apps: `api` NestJS, `web` Next.js; packages: tipe/validasi bersama, modul `payroll-engine` murni).
2. Docker Compose development: api, web, postgres, redis.
3. Setup PostgreSQL dengan RLS dan mekanisme `tenant_id` per request (buat dan uji ini lebih dulu, karena memengaruhi semua tabel).
4. Draf skema awal: tenant, user dan peran, karyawan, tugas, penilaian KPI, komponen gaji, periode payroll, tabel aturan regulasi berlaku-tanggal, audit log.
5. Modul `payroll-engine` murni dengan unit test untuk skenario BPJS, lembur, dan PPh 21 TER.
6. Modul tugas harian dan KPI dasar, baru kemudian integrasi AI dengan alur review.

Aturan kerja: jangan hardcode aturan regulasi, jangan pakai float untuk uang, jangan lewati RLS, dan jangan biarkan skor AI final tanpa review manusia.
