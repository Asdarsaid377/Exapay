import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Penulis file worker ke storage S3-compatible (SeaweedFS self-hosted) — hasil job (PDF slip gaji, feature 31).
// Konfigurasi klien sama dengan S3FileStorage API (path-style, checksum hanya bila diwajibkan). Bucket dibuat API.
// Key selalu diawali `tenants/<tenant_id>/`; file dibaca hanya lewat endpoint API yang memeriksa akses.
export abstract class FileStorage {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
}

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export class S3FileStorage extends FileStorage {
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    super();
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  // Dipanggil Nest saat worker berhenti
  onApplicationShutdown(): void {
    this.client.destroy();
  }
}

// Key file milik tenant: tenants/<tenant_id>/<bagian>/…
export function tenantFileKey(tenantId: string, ...parts: string[]): string {
  return ["tenants", tenantId, ...parts].join("/");
}
