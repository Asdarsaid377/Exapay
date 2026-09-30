// Jam lokal usaha & hitung telat (feature 14) — fungsi murni: waktu server dikirim sebagai input, tanpa Date.now() tersembunyi.

export type LocalClock = {
  // Tanggal kalender YYYY-MM-DD di zona waktu usaha
  date: string;
  // Menit sejak tengah malam lokal (detik diabaikan: 08:00:59 = 480)
  minutes: number;
};

export function localClock(instant: Date, timeZone: string): LocalClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((p) => p.type === type)?.value;
    if (value === undefined) throw new Error(`[attendance/localClock] bagian ${type} tidak ada`);
    return value;
  };
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    minutes: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

// "08:00" / "08:00:00" → 480
export function minutesOfDay(time: string): number {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
}

// Menit telat terhadap jam masuk jadwal (menit penuh). Tanpa jadwal (bukan hari kerja) → 0.
// Toleransi keterlambatan bukan di sini — diatur aturan potongan absensi (feature 17).
export function lateMinutes(checkInMinutes: number, scheduledStart: string | null): number {
  if (scheduledStart === null) return 0;
  return Math.max(0, checkInMinutes - minutesOfDay(scheduledStart));
}

// "2026-09" → rentang tanggal bulan itu
export function monthRange(month: string): { from: string; to: string } {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7));
  // Hari ke-0 bulan berikutnya = hari terakhir bulan ini
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}
