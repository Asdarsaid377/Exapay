import { LANDING_CONTACT } from "@/lib/landingContent";

// Isi halaman /privasi & /syarat (sisa feature 43). DRAF disusun dari perilaku aplikasi yang sebenarnya — WAJIB ditinjau
// ahli hukum sebelum peluncuran publik. Setiap klaim harus sesuai fitur yang ada (ubah teks bila perilaku aplikasi berubah).
// Penyelenggara: perorangan (keputusan user 2026-10-03); nama lengkap & domisili belum diberikan → LEGAL_OPERATOR.

export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
  // Paragraf setelah daftar
  after?: readonly string[];
};

export type LegalDocument = {
  title: string;
  description: string;
  // Tanggal berlaku YYYY-MM-DD
  effectiveDate: string;
  intro: readonly string[];
  sections: readonly LegalSection[];
};

// null = belum diisi user → teks memakai "pengelola Exapay"
export const LEGAL_OPERATOR: { name: string | null; city: string | null } = { name: null, city: null };

const OPERATOR = LEGAL_OPERATOR.name
  ? `${LEGAL_OPERATOR.name}${LEGAL_OPERATOR.city ? `, berdomisili di ${LEGAL_OPERATOR.city}` : ""}`
  : "pengelola Exapay";
const CONTACT = `email ${LANDING_CONTACT.email} atau WhatsApp ${LANDING_CONTACT.whatsappLabel}`;
const EFFECTIVE_DATE = "2026-10-03";

export const PRIVACY_POLICY: LegalDocument = {
  title: "Kebijakan Privasi",
  description: "Data apa yang disimpan Exapay, untuk apa, siapa yang bisa melihatnya, berapa lama disimpan, dan hak Anda atas data tersebut.",
  effectiveDate: EFFECTIVE_DATE,
  intro: [
    `Exapay adalah aplikasi penggajian, absensi, dan kinerja karyawan untuk usaha kecil yang dikelola secara perorangan oleh ${OPERATOR} ("kami"). Kebijakan ini menjelaskan bagaimana kami memproses data pribadi sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP).`,
  ],
  sections: [
    {
      id: "peran",
      title: "Peran kami dan peran usaha Anda",
      paragraphs: [
        "Data karyawan (identitas, gaji, absensi, tugas, penilaian) dimasukkan dan dikelola oleh usaha yang berlangganan Exapay. Untuk data tersebut, usaha Anda adalah pengendali data pribadi, dan kami adalah prosesor yang memproses data hanya untuk menjalankan layanan sesuai perintah usaha Anda.",
        "Untuk data akun pengguna (nama, email, kata sandi) serta data langganan dan pembayaran, kami adalah pengendali data pribadi.",
        "Pemilik usaha bertanggung jawab memberi tahu karyawannya bahwa data mereka diolah di Exapay, termasuk foto selfie dan lokasi saat absen bila fitur itu diaktifkan.",
      ],
    },
    {
      id: "data",
      title: "Data yang kami simpan",
      items: [
        "Akun pengguna: nama, email, peran di usaha, dan kata sandi yang disimpan dalam bentuk hash (tidak bisa dibaca kembali, termasuk oleh kami).",
        "Profil usaha: nama usaha, kota, dan data usaha yang Anda isi.",
        "Data karyawan: nama, nomor induk karyawan, email, nomor HP, tanggal lahir, jenis kelamin, departemen, jabatan, atasan, status kerja, tanggal masuk dan keluar, NIK, NPWP, status PTKP, rekening bank, komponen gaji, dan kepesertaan BPJS. NIK, NPWP, dan nomor rekening disimpan terenkripsi.",
        "Absensi: jam masuk dan pulang (jam server, bukan jam HP), jadwal atau shift, serta pengajuan izin, sakit, dan cuti beserta lampirannya (misalnya surat dokter).",
        "Lokasi saat absen: koordinat GPS dan akurasinya, hanya bila usaha mengatur lokasi kerja dan karyawan memberi izin lokasi di browser. Lokasi hanya dibaca saat tombol absen ditekan, bukan dilacak terus-menerus.",
        "Foto selfie saat absen: hanya sebagai bukti kehadiran, bila usaha mewajibkannya. Kami tidak melakukan pengenalan wajah atau pemrosesan biometrik apa pun.",
        "Tugas harian dan kinerja: catatan tugas, foto bukti tugas, verifikasi atasan, skor KPI, dan penilaian berkala.",
        "Penggajian: hasil perhitungan gaji, BPJS, PPh 21, dan slip gaji.",
        "Langganan: jumlah karyawan yang ditagih, tagihan, dan konfirmasi pembayaran.",
        "Catatan teknis: log audit perubahan data (siapa mengubah apa dan kapan) serta alamat IP untuk membatasi percobaan login berulang.",
        "Statistik kunjungan halaman publik (beranda, kebijakan, pendaftaran): halaman yang dibuka, situs asal kunjungan, jenis perangkat dan browser, serta negara. Dicatat dengan Umami yang berjalan di server kami sendiri, tanpa cookie dan tanpa menyimpan alamat IP. Tidak dipakai di dalam aplikasi.",
      ],
    },
    {
      id: "tujuan",
      title: "Untuk apa data digunakan",
      items: [
        "Menjalankan fitur yang dipakai usaha Anda: menghitung gaji, BPJS, dan PPh 21, membuat slip gaji, mencatat absensi, dan menghitung skor kinerja.",
        "Mengirim email layanan: verifikasi akun, atur ulang kata sandi, undangan, slip gaji, pengingat kepatuhan, pemberitahuan jadwal shift, serta tagihan dan kuitansi.",
        "Menagih dan mengonfirmasi pembayaran langganan.",
        "Menjaga keamanan dan menelusuri perubahan data lewat log audit.",
        "Memahami berapa banyak pengunjung halaman publik dan dari mana mereka datang, untuk memperbaiki informasi di situs.",
      ],
      after: ["Kami tidak menjual data, tidak memakai data untuk iklan, dan tidak memasang pelacak pihak ketiga."],
    },
    {
      id: "ai",
      title: "Ringkasan kinerja dengan AI",
      paragraphs: [
        "Fitur ringkasan penilaian kinerja memakai layanan AI Claude dari Anthropic. Data yang dikirim hanya jabatan, departemen, periode, skor, capaian indikator KPI, dan jumlah hari hadir. Nama, NIK, gaji, foto, dan kontak karyawan tidak dikirim.",
        "Skor dihitung oleh rumus, bukan oleh AI. Ringkasan AI selalu berupa draf yang harus ditinjau dan disetujui atasan sebelum final.",
      ],
    },
    {
      id: "akses",
      title: "Siapa yang bisa melihat data",
      items: [
        "Pemilik dan admin usaha: semua data karyawan usahanya.",
        "Atasan: data bawahan langsungnya, tanpa data gaji.",
        "Karyawan: data miliknya sendiri di portal karyawan.",
        "Kami sebagai pengelola: data tingkat platform saja (nama usaha, status langganan, jumlah karyawan ditagih). Panel pengelola dirancang tanpa akses ke data karyawan dan gaji. Akses teknis ke server hanya untuk pemeliharaan, pemulihan backup, atau bila diwajibkan hukum.",
        "Data setiap usaha dipisahkan di tingkat database, sehingga satu usaha tidak bisa melihat data usaha lain.",
      ],
    },
    {
      id: "pihak-ketiga",
      title: "Pihak ketiga yang membantu layanan",
      items: [
        "Penyedia server (VPS) tempat aplikasi, database, dan file disimpan.",
        "Penyedia pengiriman email (SMTP relay) untuk mengirim email layanan.",
        "Anthropic, untuk ringkasan kinerja AI (lihat bagian di atas).",
        "Penyedia QRIS, hanya saat usaha membayar langganan. Exapay tidak menyimpan data kartu atau rekening pembayar.",
      ],
      after: ["Pihak tersebut hanya menerima data yang diperlukan untuk tugasnya. Sebagian penyedia dapat memproses data di luar Indonesia; kami memilih penyedia dengan standar pelindungan data yang memadai."],
    },
    {
      id: "retensi",
      title: "Berapa lama data disimpan",
      items: [
        "Foto selfie absen dihapus otomatis 90 hari setelah tanggal absen.",
        "Data lain disimpan selama usaha masih berlangganan atau masih memakai Exapay, karena dibutuhkan untuk riwayat gaji, pajak, dan absensi.",
        "Setelah masa trial atau langganan berakhir, akun menjadi baca-saja. Data tidak langsung dihapus agar usaha tetap bisa mengunduh laporan dan slip.",
        "Usaha dapat meminta penghapusan seluruh datanya melalui kontak di bawah. Salinan di backup terenkripsi ikut terhapus sesuai siklus backup, paling lama 6 bulan.",
      ],
      after: ["Kewajiban penyimpanan dokumen penggajian dan perpajakan menurut peraturan yang berlaku tetap menjadi tanggung jawab usaha. Unduh laporan Anda sebelum meminta penghapusan."],
    },
    {
      id: "keamanan",
      title: "Keamanan",
      items: [
        "Koneksi terenkripsi (HTTPS); sesi login disimpan dalam cookie yang tidak bisa dibaca skrip halaman.",
        "Kata sandi di-hash; NIK, NPWP, dan nomor rekening dienkripsi di database.",
        "Pemisahan data antar usaha di tingkat database dan pembatasan akses sesuai peran.",
        "Backup harian terenkripsi yang diuji pemulihannya.",
      ],
      after: [
        "Bila terjadi kegagalan pelindungan data pribadi, kami memberi tahu usaha yang terdampak paling lambat 3 × 24 jam sejak diketahui, sesuai UU PDP.",
      ],
    },
    {
      id: "hak",
      title: "Hak Anda",
      paragraphs: [
        "Anda berhak meminta informasi, akses, salinan, perbaikan, dan penghapusan data pribadi Anda, serta menarik persetujuan.",
        "Karyawan sebaiknya mengajukan permintaan atas data kepegawaiannya kepada pemilik usaha terlebih dahulu, karena usaha adalah pengendali data tersebut. Kami membantu usaha memenuhi permintaan itu.",
        `Untuk data akun dan langganan, hubungi kami di ${CONTACT}. Kami menanggapi paling lambat 3 × 24 jam.`,
      ],
    },
    {
      id: "cookie",
      title: "Cookie dan penyimpanan di perangkat",
      paragraphs: [
        "Exapay hanya memakai cookie yang diperlukan untuk login. Penyimpanan lokal di browser dipakai untuk hal kecil seperti mengingat bahwa pemberitahuan selfie sudah dibaca. Statistik kunjungan halaman publik tidak memakai cookie dan menghormati pengaturan \"Do Not Track\" di browser. Tidak ada cookie iklan atau analitik pihak ketiga.",
      ],
    },
    {
      id: "perubahan",
      title: "Perubahan kebijakan",
      paragraphs: [
        "Kami dapat memperbarui kebijakan ini bila fitur atau peraturan berubah. Tanggal berlaku di atas halaman akan diperbarui, dan perubahan penting akan diberitahukan lewat email kepada pemilik usaha.",
        `Pertanyaan tentang kebijakan ini: ${CONTACT}.`,
      ],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  title: "Syarat Layanan",
  description: "Ketentuan pemakaian Exapay: akun, trial dan langganan, pembayaran, tanggung jawab atas perhitungan gaji dan pajak, serta batasan layanan.",
  effectiveDate: EFFECTIVE_DATE,
  intro: [
    `Syarat ini berlaku antara usaha yang memakai Exapay ("Anda") dan ${OPERATOR} ("kami"). Dengan mendaftar atau memakai Exapay, Anda menyetujui syarat ini dan Kebijakan Privasi.`,
  ],
  sections: [
    {
      id: "layanan",
      title: "Layanan",
      paragraphs: [
        "Exapay membantu usaha mengelola data karyawan, absensi, tugas harian dan kinerja, serta penggajian termasuk BPJS dan PPh 21, lewat aplikasi web dan portal karyawan.",
        "Fitur dapat bertambah, berubah, atau dihentikan seiring pengembangan. Perubahan yang mengurangi fungsi utama akan diberitahukan lebih dulu.",
      ],
    },
    {
      id: "akun",
      title: "Akun dan pengguna",
      items: [
        "Pemilik usaha bertanggung jawab atas kebenaran data yang dimasukkan dan atas semua pengguna yang diundangnya (admin, atasan, karyawan).",
        "Jaga kerahasiaan kata sandi. Beri tahu kami segera bila ada akses yang tidak sah.",
        "Pemilik usaha wajib memiliki dasar yang sah untuk memproses data karyawan, termasuk memberi tahu karyawan tentang pemakaian selfie dan lokasi saat absen.",
      ],
    },
    {
      id: "langganan",
      title: "Trial, langganan, dan pembayaran",
      items: [
        "Pendaftaran baru mendapat masa trial gratis. Lama trial dan harga per karyawan aktif mengikuti yang tercantum di halaman harga pada saat itu.",
        "Tagihan dihitung dari jumlah karyawan aktif dengan jumlah minimum yang ditagih, dan dibayar lewat QRIS. Pembayaran dikonfirmasi paling lambat 1 × 24 jam dan kuitansi dikirim ke email.",
        "Bila trial atau langganan berakhir tanpa pembayaran, setelah masa tenggang akun menjadi baca-saja: data tetap bisa dilihat dan laporan serta slip tetap bisa diunduh, tetapi data tidak bisa diubah dan karyawan tidak bisa absen.",
        "Perubahan harga berlaku untuk tagihan berikutnya; tagihan yang sudah terbit tidak berubah.",
        "Pembayaran yang sudah dikonfirmasi tidak dapat dikembalikan, kecuali terjadi kesalahan tagihan dari pihak kami.",
      ],
    },
    {
      id: "perhitungan",
      title: "Perhitungan gaji, BPJS, dan pajak",
      paragraphs: [
        "Exapay menghitung BPJS dan PPh 21 berdasarkan data yang Anda masukkan dan aturan yang berlaku pada tanggal periode gaji. Kami berupaya menjaga data aturan tetap mutakhir, tetapi perhitungan adalah alat bantu.",
        "Anda tetap bertanggung jawab memeriksa draf payroll sebelum difinalkan, serta atas pembayaran gaji, penyetoran, dan pelaporan BPJS dan pajak kepada instansi terkait. Ringkasan kinerja dari AI adalah draf yang wajib ditinjau atasan dan tidak boleh menjadi satu-satunya dasar keputusan kepegawaian.",
      ],
    },
    {
      id: "pemakaian",
      title: "Pemakaian yang dilarang",
      items: [
        "Memasukkan data palsu atau data orang yang tidak berhubungan dengan usaha Anda.",
        "Mencoba mengakses data usaha lain, menguji celah keamanan tanpa izin tertulis, atau mengganggu kerja layanan.",
        "Memakai Exapay untuk tujuan yang melanggar hukum, termasuk pengawasan karyawan di luar keperluan kerja.",
      ],
      after: ["Kami dapat menangguhkan akun yang melanggar ketentuan ini setelah memberi pemberitahuan, kecuali untuk pelanggaran berat yang membahayakan pengguna lain."],
    },
    {
      id: "data",
      title: "Kepemilikan data",
      paragraphs: [
        "Data yang Anda masukkan tetap milik usaha Anda. Anda dapat mengekspor laporan kapan saja, termasuk saat akun baca-saja, dan dapat meminta penghapusan data sesuai Kebijakan Privasi.",
      ],
    },
    {
      id: "ketersediaan",
      title: "Ketersediaan layanan",
      paragraphs: [
        "Kami berupaya menjaga Exapay tetap tersedia dan mencadangkan data setiap hari, tetapi tidak menjamin layanan bebas gangguan. Pemeliharaan terjadwal diusahakan di luar jam kerja.",
      ],
    },
    {
      id: "tanggung-jawab",
      title: "Batasan tanggung jawab",
      paragraphs: [
        "Sejauh diizinkan hukum, kami tidak bertanggung jawab atas kerugian tidak langsung, termasuk denda atau sanksi akibat data yang salah dimasukkan atau draf yang tidak diperiksa. Tanggung jawab kami paling banyak sebesar biaya langganan yang Anda bayar dalam 3 bulan terakhir sebelum kejadian.",
      ],
    },
    {
      id: "berhenti",
      title: "Berhenti berlangganan",
      paragraphs: [
        "Anda dapat berhenti kapan saja dengan tidak memperpanjang langganan. Kami dapat mengakhiri layanan dengan pemberitahuan paling lambat 30 hari sebelumnya, dan memberi kesempatan mengunduh data.",
      ],
    },
    {
      id: "hukum",
      title: "Hukum yang berlaku",
      paragraphs: [
        "Syarat ini tunduk pada hukum Republik Indonesia. Perselisihan diselesaikan lebih dulu secara musyawarah; bila tidak tercapai, melalui pengadilan negeri yang berwenang.",
      ],
    },
    {
      id: "kontak",
      title: "Perubahan dan kontak",
      paragraphs: [
        "Kami dapat memperbarui syarat ini. Perubahan penting diberitahukan lewat email kepada pemilik usaha paling lambat 14 hari sebelum berlaku.",
        `Pertanyaan: ${CONTACT}.`,
      ],
    },
  ],
};
