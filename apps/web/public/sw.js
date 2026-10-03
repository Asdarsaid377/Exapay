// Service worker Exapay (feature 37): PWA bisa dipasang + tampilan offline sederhana.
// Sengaja TIDAK meng-cache halaman, data, maupun respons API — isinya data pribadi per pengguna (slip gaji, data
// karyawan). Navigasi selalu ke jaringan; hanya saat jaringan gagal, halaman statis /offline.html yang ditampilkan.
// Ubah CACHE_NAME bila isi PRECACHE berubah agar cache lama dibersihkan.
const CACHE_NAME = "exapay-offline-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode !== "navigate") return;
  event.respondWith(
    fetch(request).catch(async () => {
      const offline = await caches.match(OFFLINE_URL);
      return offline ?? Response.error();
    }),
  );
});
