import { ATTENDANCE_SELFIE_QUEUE_NAME, ATTENDANCE_SELFIE_SCAN_JOB } from "@exapay/shared";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

// Jalankan penghapusan selfie absen > 90 hari SEKARANG (tanpa menunggu jadwal harian) — untuk verifikasi/dev dan pemulihan
// manual. Job diproses worker yang sedang berjalan: `pnpm --filter @exapay/worker selfie:purge`.
async function main(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL belum diisi");
  const connection = new Redis(url, { maxRetriesPerRequest: null });
  const queue = new Queue(ATTENDANCE_SELFIE_QUEUE_NAME, { connection });
  try {
    const job = await queue.add(ATTENDANCE_SELFIE_SCAN_JOB, {}, { removeOnComplete: 30, removeOnFail: 30 });
    console.log(`Penghapusan selfie diantrekan (job ${job.id ?? "?"}) — lihat log worker`);
  } finally {
    await queue.close();
    await connection.quit();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
