import { BILLING_NOTICE_SCAN_JOB, BILLING_QUEUE_NAME } from "@exapay/shared";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

// Jalankan pemindaian pengingat langganan SEKARANG (tanpa menunggu jadwal harian) — untuk verifikasi/dev dan pemulihan
// manual. Job diproses worker yang sedang berjalan: `pnpm --filter @exapay/worker billing:scan`.
async function main(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL belum diisi");
  const connection = new Redis(url, { maxRetriesPerRequest: null });
  const queue = new Queue(BILLING_QUEUE_NAME, { connection });
  try {
    const job = await queue.add(BILLING_NOTICE_SCAN_JOB, {}, { removeOnComplete: 30, removeOnFail: 30 });
    console.log(`Pemindaian pengingat langganan diantrekan (job ${job.id ?? "?"}) — lihat log worker & Mailpit`);
  } finally {
    await queue.close();
    await connection.quit();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
