import { createHash } from "node:crypto";

import { HttpException, HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";

import { REDIS_CLIENT } from "../../redis/redis.module.js";

// Pembatas percobaan endpoint auth (brute force & spam email), penghitung jendela tetap di Redis.
// Kunci berisi hash SHA-256 dari email/IP — Redis tidak menyimpan email/IP mentah.
// Redis mati → diizinkan (dicatat di log): login tetap jalan, perlindungan argon2 + cooldown per email tetap ada.

export type RateLimitPolicy = {
  name: string;
  limit: number;
  windowSeconds: number;
  message: string;
};

const LOGIN_MESSAGE = "Terlalu banyak percobaan login. Coba lagi dalam {minutes} menit.";

export const AUTH_RATE_LIMITS = {
  // Hanya percobaan GAGAL yang dihitung: karyawan satu kantor (satu IP NAT) yang login benar tidak saling memblokir
  loginFailuresPerIp: { name: "login-fail-ip", limit: 50, windowSeconds: 15 * 60, message: LOGIN_MESSAGE },
  // Dibatasi per email juga agar tebakan dari banyak IP tetap tertahan. Harga: pemilik akun bisa ikut tertahan ≤ 15 menit.
  loginFailuresPerEmail: { name: "login-fail-email", limit: 10, windowSeconds: 15 * 60, message: LOGIN_MESSAGE },
  changePasswordFailuresPerUser: {
    name: "change-password-fail-user",
    limit: 5,
    windowSeconds: 15 * 60,
    message: "Terlalu banyak percobaan password salah. Coba lagi dalam {minutes} menit.",
  },
  // Lupa password, signup, kirim ulang verifikasi — per endpoint; cooldown per email sudah ada di masing-masing service
  emailRequestsPerIp: {
    name: "email-request-ip",
    limit: 20,
    windowSeconds: 60 * 60,
    message: "Terlalu banyak permintaan dari jaringan Anda. Coba lagi dalam {minutes} menit.",
  },
} as const satisfies Record<string, RateLimitPolicy>;

// Subjek yang dihitung; id kosong (mis. IP tidak diketahui) dilewati
export type RateLimitSubject = { policy: RateLimitPolicy; id: string | null | undefined; scope?: string };

const KEY_PREFIX = "ratelimit";

@Injectable()
export class AuthRateLimitService {
  private readonly logger = new Logger(AuthRateLimitService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // 429 jika salah satu subjek sudah mencapai batas (tanpa menambah hitungan)
  async ensureAllowed(subjects: RateLimitSubject[]): Promise<void> {
    for (const subject of this.known(subjects)) {
      const key = this.keyOf(subject);
      try {
        const [count, ttl] = await Promise.all([this.redis.get(key), this.redis.ttl(key)]);
        if (Number(count ?? 0) >= subject.policy.limit) this.reject(subject.policy, ttl);
      } catch (error: unknown) {
        if (error instanceof HttpException) throw error;
        this.warn(error);
      }
    }
  }

  // Tambah hitungan (dipakai setelah percobaan gagal)
  async record(subjects: RateLimitSubject[]): Promise<void> {
    for (const subject of this.known(subjects)) {
      try {
        await this.increment(subject);
      } catch (error: unknown) {
        this.warn(error);
      }
    }
  }

  // Tambah hitungan lalu tolak jika melewati batas (dipakai untuk setiap permintaan, berhasil atau tidak)
  async consume(subject: RateLimitSubject): Promise<void> {
    if (!subject.id) return;
    try {
      const { count, ttl } = await this.increment(subject);
      if (count > subject.policy.limit) this.reject(subject.policy, ttl);
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.warn(error);
    }
  }

  async clear(subjects: RateLimitSubject[]): Promise<void> {
    const keys = this.known(subjects).map((subject) => this.keyOf(subject));
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (error: unknown) {
      this.warn(error);
    }
  }

  private async increment(subject: RateLimitSubject): Promise<{ count: number; ttl: number }> {
    const key = this.keyOf(subject);
    // EXPIRE NX: jendela dimulai di percobaan pertama, tidak diperpanjang percobaan berikutnya
    const results = await this.redis.multi().incr(key).expire(key, subject.policy.windowSeconds, "NX").ttl(key).exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    const ttl = Number(results?.[2]?.[1] ?? subject.policy.windowSeconds);
    return { count, ttl };
  }

  private known(subjects: RateLimitSubject[]): RateLimitSubject[] {
    return subjects.filter((subject) => Boolean(subject.id));
  }

  private keyOf(subject: RateLimitSubject): string {
    const digest = createHash("sha256").update(String(subject.id).toLowerCase()).digest("hex");
    return [KEY_PREFIX, subject.policy.name, subject.scope, digest].filter(Boolean).join(":");
  }

  private reject(policy: RateLimitPolicy, ttlSeconds: number): never {
    const minutes = Math.max(1, Math.ceil((ttlSeconds > 0 ? ttlSeconds : policy.windowSeconds) / 60));
    throw new HttpException(policy.message.replace("{minutes}", String(minutes)), HttpStatus.TOO_MANY_REQUESTS);
  }

  private warn(error: unknown): void {
    this.logger.warn(`[auth/rate-limit] Redis tidak tersedia, pembatasan dilewati: ${error instanceof Error ? error.message : String(error)}`);
  }
}
