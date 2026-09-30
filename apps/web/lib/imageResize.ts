// Perkecil foto kamera HP sebelum diunggah (feature 19): sisi terpanjang maks. 1600 px, JPEG kualitas 0,82.
// Hanya di browser. Gagal (format tidak dikenali browser, mis. HEIC di Android) → file asli dikirim apa adanya
// dan API tetap memeriksa jenis & ukurannya.

const MAX_SIDE = 1600;
const QUALITY = 0.82;
// Foto kecil tidak perlu diproses ulang
const SKIP_BELOW_BYTES = 400 * 1024;

export async function shrinkPhoto(file: File): Promise<File> {
  if (file.size < SKIP_BELOW_BYTES && (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp")) return file;
  try {
    // imageOrientation: foto potret dari kamera tetap tegak (EXIF)
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]*$/, "") || "foto";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
