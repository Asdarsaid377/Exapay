# Deploy Production — Exapay (satu VPS)

Runbook feature 38. Semua perintah dijalankan dari **root repo di VPS**, kecuali disebut lain.

```
Internet ──443──▶ Caddy ──/api/*──▶ api (NestJS) ──▶ postgres · redis · storage (SeaweedFS)
                    └────lainnya──▶ web (Next.js) ──▶ api
                                     worker ──▶ postgres · redis · storage · SMTP relay · Claude
                                     backup ──(restic, terenkripsi)──▶ S3 eksternal (R2/B2)
```

Hanya Caddy yang membuka port (80/443). Postgres, Redis, SeaweedFS, API, dan web hanya ada di jaringan Docker.

| File | Isi |
| --- | --- |
| `docker-compose.prod.yml` | Semua service production + env per service |
| `.env.production.example` | Template env → salin ke `.env.production` (tidak di-commit) |
| `docker/production/Dockerfile` | Image ramping per target: `api`, `worker`, `web`, `migrate` |
| `docker/production/caddy/Caddyfile` | Reverse proxy, HTTPS otomatis, header keamanan |
| `docker/production/seaweedfs/start.sh` | Identitas S3 terbatas (app & backup baca-saja) |
| `docker/production/backup/` | Image backup: `backup.sh`, `restore.sh` (restic + rclone + pg_dump 18) |
| `docker/production/restore-test.{yml,sh}` | Uji restore ke instance terpisah |

---

## 1. Siapkan VPS (sekali)

Minimal **2 vCPU, 4 GB RAM, 40 GB SSD**, Ubuntu 24.04 LTS.

```bash
# Docker Engine + plugin compose (repo resmi Docker)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # login ulang setelahnya

# Firewall: hanya SSH + HTTP/HTTPS
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp
sudo ufw enable
```

> Docker menulis aturan iptables sendiri dan **melewati ufw** untuk port yang di-publish. Karena itu compose
> production sengaja tidak mem-publish port selain Caddy. Jangan menambah `ports:` ke postgres/redis/storage/api.

DNS: buat record **A** (dan AAAA jika ada IPv6) `APP_DOMAIN` → IP VPS **sebelum** start pertama (Let's Encrypt butuh port 80 terjangkau).

## 2. Env production

```bash
git clone <repo> exapayroll && cd exapayroll
cp .env.production.example .env.production && chmod 600 .env.production
```

Isi semua nilai kosong. Secret acak:

```bash
openssl rand -hex 32      # POSTGRES_PASSWORD, APP_OWNER_PASSWORD, APP_USER_PASSWORD, JWT_*, S3_*, STORAGE_BACKUP_*, RESTIC_PASSWORD
openssl rand -base64 32   # DATA_ENCRYPTION_KEY
```

Pakai **hex** untuk password database (masuk ke URL koneksi — karakter `@:/` merusak URL).

**Simpan `.env.production` di password manager (di luar VPS).** Tanpa `DATA_ENCRYPTION_KEY`, NIK/NPWP/rekening di backup tidak bisa dibaca. Tanpa `RESTIC_PASSWORD`, backup tidak bisa dibuka sama sekali.

## 3. Email production (SMTP relay)

Provider tier gratis yang cocok (pilih satu): **Brevo** (300 email/hari), **Resend** (100/hari), **Mailjet** (200/hari).

1. Daftar, lalu tambahkan & verifikasi **domain pengirim** (domain di `SMTP_FROM`).
2. Pasang record DNS dari provider: **SPF** (TXT), **DKIM** (TXT/CNAME), dan **DMARC** (`_dmarc` TXT, mulai `v=DMARC1; p=none; rua=mailto:…`).
3. Isi `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS atau 465 TLS), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.

Di production API & worker **menolak SMTP tanpa TLS** (`requireTLS`). Relay tanpa TLS → email gagal (tercatat di log `[email/send]`).

## 4. Backup eksternal (Cloudflare R2)

1. Dashboard Cloudflare → R2 → **Create bucket** (mis. `exapay-backup`), lokasi terdekat (APAC).
2. R2 → **Manage API tokens** → token *Object Read & Write* yang **dibatasi ke bucket itu saja**.
3. Isi:
   ```
   RESTIC_REPOSITORY=s3:https://<ACCOUNT_ID>.r2.cloudflarestorage.com/exapay-backup
   BACKUP_S3_ACCESS_KEY_ID=<Access Key ID token>
   BACKUP_S3_SECRET_ACCESS_KEY=<Secret Access Key token>
   BACKUP_S3_REGION=auto
   ```
4. Opsional: buat check di **healthchecks.io** (gratis), periode 1 hari, grace 2 jam → isi `BACKUP_HEALTHCHECK_URL`. Anda dapat email jika backup gagal atau tidak jalan.

Backblaze B2 juga bisa: `RESTIC_REPOSITORY=s3:https://s3.<region>.backblazeb2.com/<bucket>`, `BACKUP_S3_REGION=<region>`.

## 5. Start pertama

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

Urutan otomatis: postgres (role dibuat `docker/postgres/init`) → `migrate` (drizzle-kit, keluar 0) → api/worker → web → Caddy (sertifikat HTTPS).

Cek:

```bash
curl -s https://$APP_DOMAIN/api/health          # {"success":true,…"database":"up","redis":"up"}
```

Super-admin (password dari env, tidak masuk riwayat shell jika diawali spasi):

```bash
 docker compose -f docker-compose.prod.yml --env-file .env.production run --rm \
   -e SUPER_ADMIN_PASSWORD='…' migrate \
   node /repo/apps/api/dist/scripts/create-super-admin.js --email admin@domain --name "Nama"
```

Backup pertama manual (membuat repository restic):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backup backup.sh
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backup restic snapshots
```

Lalu langsung **uji restore** (bagian 7) sebelum ada data klien.

## 5b. VPS yang sudah menjalankan ERPNext / Nginx di 80/443

Bench ERPNext (`bench setup production`) memasang **Nginx + supervisor** di port 80/443. Caddy Exapay tidak boleh
memakai port itu — jalankan mode **di belakang proxy**: Nginx host memegang HTTPS (certbot), Caddy Exapay hanya
mendengar di `127.0.0.1:8090`.

```
Internet ──443──▶ Nginx host (ERPNext + exapay.conf) ──hr.solvexaerp.tech──▶ 127.0.0.1:8090 Caddy ──▶ web / api
                         └── situs ERPNext seperti biasa
```

Perbedaan dari bagian 1 dan 5:

1. **Firewall:** port 80/443 sudah dipakai ERPNext — tidak perlu menambah aturan ufw.
2. **DNS:** record A `hr.solvexaerp.tech` → IP VPS. Di Cloudflare set **DNS only** (awan abu-abu) minimal sampai
   sertifikat terbit.
3. **Port 8090 bebas?** `sudo ss -ltnp | grep 8090` harus kosong (ERPNext memakai 8000, 9000, 11000–13000, 3306).
4. **Start** selalu dengan dua file compose (juga saat update versi, backup manual, dan membuat super-admin):
   ```bash
   docker compose -f docker-compose.prod.yml -f docker-compose.behind-proxy.yml --env-file .env.production up -d --build
   curl -s http://127.0.0.1:8090/api/health
   ```
   Agar tidak salah ketik, buat alias: `alias exa='docker compose -f docker-compose.prod.yml -f docker-compose.behind-proxy.yml --env-file .env.production'`
   lalu pakai `exa ps`, `exa logs -f api`, `exa run --rm backup backup.sh`, dst.
5. **Nginx host + sertifikat:**
   ```bash
   sudo cp docker/production/nginx/exapay.conf.example /etc/nginx/conf.d/exapay.conf
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d hr.solvexaerp.tech      # tambah HTTPS + redirect otomatis; perpanjangan otomatis dari certbot
   curl -s https://hr.solvexaerp.tech/api/health
   ```
   File ini terpisah dari `frappe-bench.conf`, jadi tidak tertimpa `bench setup nginx`. Bila certbot belum terpasang:
   `sudo apt install certbot python3-certbot-nginx`.
6. **Build pertama makan CPU ±10–15 menit** di 2 vCPU — jalankan di luar jam sibuk ERPNext. Update berikutnya lebih
   cepat (cache layer Docker).

Rate limit auth tetap memakai IP klien asli: Nginx mengganti `X-Forwarded-For` dengan `$remote_addr`, Caddy
mempercayai Nginx (jaringan privat) dan menambah IP-nya, API memakai `TRUST_PROXY_HOPS=2` (diatur override).

## 6. Update versi

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`migrate` berjalan ulang otomatis sebelum api/worker. Migration bersifat maju saja — sebelum update besar jalankan backup manual dulu. Bersihkan image lama sesekali: `docker image prune -f`.

Log: `docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api worker` (rotasi 5 × 10 MB per container).

## 7. Backup & restore

**Jadwal:** setiap hari `BACKUP_CRON` (default 02:30 WIB). Isi: `pg_dump` custom format seluruh database + mirror bucket storage (lampiran, foto tugas, slip PDF). Retensi 7 harian, 4 mingguan, 6 bulanan. Setiap putaran menjalankan `restic check` (5% data acak). pg_dump yang gagal membatalkan snapshot — tidak ada dump terpotong.

**Uji restore — wajib setiap bulan dan setelah update besar:**

```bash
sh docker/production/restore-test.sh             # instance uji dibuang setelah selesai
KEEP=1 sh docker/production/restore-test.sh      # biarkan menyala, API uji di 127.0.0.1:14000 (SSH tunnel)
```

Skrip memulihkan snapshot terbaru ke Postgres + SeaweedFS **baru** (project `exapay-restore-test`, jaringan sendiri), menyalakan API production di atasnya, lalu membandingkan jumlah tabel, tabel RLS FORCE, migration, tenant, karyawan, payroll, dan slip dengan production. Catat hasilnya di bagian Riwayat di bawah.

**Pemulihan bencana (VPS hilang):**

1. VPS baru → bagian 1–2 dengan `.env.production` **yang sama** (dari password manager).
2. Start hanya penyimpanan: `docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres storage redis`.
3. Restore ke database & bucket production yang masih kosong:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production run --rm \
     -e RESTORE_PG_HOST=postgres -e RESTORE_PG_USER="$POSTGRES_USER" -e RESTORE_PG_PASSWORD="$POSTGRES_PASSWORD" \
     -e RESTORE_PG_DB="$POSTGRES_DB" -e RESTORE_S3_ENDPOINT=http://storage:8333 -e RESTORE_S3_BUCKET="$S3_BUCKET" \
     -e RESTORE_S3_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" -e RESTORE_S3_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
     backup restore.sh
   ```
   (export variabel dari `.env.production` ke shell lebih dulu: `set -a; . ./.env.production; set +a`.)
4. `docker compose -f docker-compose.prod.yml --env-file .env.production up -d` → `migrate` hanya menerapkan migration yang lebih baru dari backup.

`restore.sh` menolak database tujuan yang sudah berisi tabel. Menimpa database berisi data hanya dengan `-e RESTORE_CONFIRM=<nama database>` — **jangan lakukan di production kecuali memang memulihkan bencana**.

Snapshot tertentu: `restic snapshots` → `restore.sh <id snapshot postgres> <id snapshot storage>`.

## 8. Keamanan yang sudah terpasang

- HTTPS + HSTS, `X-Frame-Options: DENY`, `nosniff`, header `Server`/`X-Powered-By` dibuang.
- Cookie sesi `Secure` + `httpOnly` + `SameSite=Lax` (otomatis saat `NODE_ENV=production`).
- **Rate limit auth** (Redis): login gagal 10/15 menit per email & 50/15 menit per IP, ganti password salah 5/15 menit per akun, lupa password/signup/kirim ulang verifikasi 20/jam per IP. IP klien diambil dari `X-Forwarded-For` yang ditulis Caddy (kiriman klien diabaikan) — `TRUST_PROXY_HOPS=1`.
- SeaweedFS tanpa identitas admin global: aplikasi hanya bucket `S3_BUCKET`, backup baca-saja.
- Container aplikasi berjalan sebagai user `node` (non-root); setiap service hanya menerima env yang dibutuhkan.

## 9. Analitik pengunjung (opsional) — Umami self-hosted

Mencatat kunjungan **halaman publik saja** (beranda, kebijakan, pendaftaran) + klik "Coba gratis"/WhatsApp & pendaftaran
berhasil. Tanpa cookie, data di VPS sendiri (database `umami` di Postgres Exapay), ±180 MB RAM. Tidak pernah dimuat di
dalam aplikasi. Sudah disebut di Kebijakan Privasi.

1. Isi `.env.production` (`openssl rand -hex 32` untuk ketiganya): `UMAMI_DB_PASSWORD`, `UMAMI_APP_SECRET`, `UMAMI_2FA_KEY`.
2. Tambah file analitik ke alias `exa` (di `~/.bashrc`, lalu `source ~/.bashrc`):
   ```bash
   alias exa='docker compose -f ~/exapay/docker-compose.prod.yml -f ~/exapay/docker-compose.behind-proxy.yml -f ~/exapay/docker-compose.analytics.yml --env-file ~/exapay/.env.production --project-directory ~/exapay'
   exa up -d umami && curl -s http://127.0.0.1:8091/api/heartbeat     # {"ok":true}
   ```
3. DNS A `stats.<domain>` → IP VPS (DNS only), lalu:
   ```bash
   sudo cp docker/production/nginx/stats.conf.example /etc/nginx/conf.d/exapay-stats.conf   # ganti domain bila beda
   sudo nginx -t && sudo systemctl reload nginx && sudo certbot --nginx -d stats.solvexaerp.tech
   ```
4. Buka `https://stats.<domain>` → login `admin` / `umami` → **segera ganti password** (Settings › Profile).
5. Settings › Websites › **Add website** (nama Exapay, domain `hr.<domain>`) → buka kode pelacak, salin URL skrip
   (`https://stats.<domain>/exa.js`) dan `data-website-id`. Isi `UMAMI_SCRIPT_URL` & `UMAMI_WEBSITE_ID`, lalu
   `exa up -d web` (web membaca env saat start).
6. Cek: buka landing, Umami › Realtime menampilkan kunjungan. Event: `cta-hero`, `cta-header`, `cta-menu`, `cta-pricing`,
   `cta-closing`, `whatsapp-faq`, `whatsapp-closing`, `signup`.

Database `umami` ikut backup harian (pg_dump hanya database Exapay — statistik **tidak** ikut backup; bila hilang, cukup
mulai ulang hitungan).

## 10. Google Search Console

1. search.google.com/search-console → **Add property** → pilih **Domain** → `solvexaerp.tech`.
2. Salin record **TXT** `google-site-verification=…` → Cloudflare › DNS › Add record (Type TXT, Name `@`) → **Verify**.
3. Sitemaps → kirim `https://hr.solvexaerp.tech/sitemap.xml`. URL Inspection → `https://hr.solvexaerp.tech/` → **Request indexing**.
4. Pratinjau tautan WhatsApp/Facebook: cek di developers.facebook.com/tools/debug (tombol *Scrape Again* bila gambar lama
   masih tampil). WhatsApp menyimpan pratinjau lama beberapa saat — uji dengan tautan berparameter, mis. `/?v=2`.

## Riwayat uji restore

| Tanggal | Lingkungan | Snapshot | Hasil |
| --- | --- | --- | --- |
| 2026-10-02 | Lokal (Docker Desktop, offsite = SeaweedFS kedua) | latest | 44 tabel, 44 RLS FORCE, 30 migration, data & lampiran identik, NIK/rekening terdekripsi |
