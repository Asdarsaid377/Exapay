import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env.js";

// Enkripsi kolom sensitif di level aplikasi (database-standards "Snapshot, Audit, Data Sensitif"): AES-256-GCM.
// Format tersimpan: "v1:" + base64(iv 12 byte | ciphertext | tag 16 byte). Prefix versi = ruang untuk rotasi kunci.
// AAD mengikat ciphertext ke tenant + kolom: nilai yang disalin ke baris tenant lain / kolom lain gagal didekripsi.
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

// Konteks ciphertext: tenant pemilik + nama kolom (mis. "employees.nik")
export type CipherContext = { tenantId: string; field: string };

@Injectable()
export class FieldCipher {
  private readonly key: Buffer;
  // Kunci terpisah (diturunkan HKDF) untuk blind index — kunci enkripsi tidak dipakai ganda
  private readonly indexKey: Buffer;

  constructor(config: ConfigService<Env, true>) {
    this.key = Buffer.from(config.get("DATA_ENCRYPTION_KEY", { infer: true }), "base64");
    if (this.key.length !== 32) throw new Error("[crypto/FieldCipher] DATA_ENCRYPTION_KEY harus 32 byte");
    this.indexKey = Buffer.from(hkdfSync("sha256", this.key, Buffer.alloc(0), "exapay/blind-index/v1", 32));
  }

  encrypt(plaintext: string, context: CipherContext): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(aadOf(context));
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return `${VERSION}:${Buffer.concat([iv, data, cipher.getAuthTag()]).toString("base64")}`;
  }

  // Ciphertext rusak / kunci salah / konteks tidak cocok → melempar error (jangan pernah mengembalikan nilai tebakan)
  decrypt(payload: string, context: CipherContext): string {
    const [version, body] = payload.split(":", 2);
    if (version !== VERSION || !body) throw new Error("[crypto/FieldCipher] format ciphertext tidak dikenal");
    const raw = Buffer.from(body, "base64");
    if (raw.length < IV_BYTES + TAG_BYTES) throw new Error("[crypto/FieldCipher] ciphertext terlalu pendek");
    const decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, IV_BYTES));
    decipher.setAAD(aadOf(context));
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)), decipher.final()]).toString("utf8");
  }

  // HMAC-SHA256 deterministik untuk cek duplikat/cari tanpa mendekripsi. Tenant ikut di-hash: nilai yang sama
  // di dua tenant menghasilkan hash berbeda (tidak bisa dikorelasikan lintas tenant).
  blindIndex(value: string, context: CipherContext): string {
    return createHmac("sha256", this.indexKey).update(`${context.tenantId}\n${context.field}\n${value}`).digest("hex");
  }
}

function aadOf({ tenantId, field }: CipherContext): Buffer {
  return Buffer.from(`${tenantId}\n${field}`, "utf8");
}
