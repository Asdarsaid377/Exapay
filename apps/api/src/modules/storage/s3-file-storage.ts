import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../../common/config/env.js";
import { FileStorage } from "./file-storage.js";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class S3FileStorage extends FileStorage implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(S3FileStorage.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.bucket = config.get("S3_BUCKET", { infer: true });
    this.client = new S3Client({
      endpoint: config.get("S3_ENDPOINT", { infer: true }),
      region: config.get("S3_REGION", { infer: true }),
      credentials: {
        accessKeyId: config.get("S3_ACCESS_KEY_ID", { infer: true }),
        secretAccessKey: config.get("S3_SECRET_ACCESS_KEY", { infer: true }),
      },
      // SeaweedFS/MinIO-style: bucket di path, bukan subdomain
      forcePathStyle: true,
      // Checksum hanya bila diwajibkan operasi — server S3-compatible tidak semuanya mendukung checksum bawaan SDK terbaru
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  // Bucket dibuat sekali jika belum ada. Storage mati tidak menggagalkan start API — upload/unduh yang gagal dilaporkan per request.
  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error: unknown) {
      if (!(error instanceof S3ServiceException) || error.$metadata.httpStatusCode !== 404) {
        this.logger.warn(`[storage/init] bucket "${this.bucket}" tidak dapat diperiksa: ${messageOf(error)}`);
        return;
      }
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`[storage/init] bucket "${this.bucket}" dibuat`);
      } catch (createError: unknown) {
        this.logger.warn(`[storage/init] bucket "${this.bucket}" gagal dibuat: ${messageOf(createError)}`);
      }
    }
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    try {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
    } catch (error: unknown) {
      this.logger.error(`[storage/put] ${key}: ${messageOf(error)}`);
      throw new Error("File gagal disimpan", { cause: error });
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!result.Body) throw new Error("respons tanpa isi");
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (error: unknown) {
      this.logger.error(`[storage/get] ${key}: ${messageOf(error)}`);
      throw new Error("File gagal dibaca", { cause: error });
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error: unknown) {
      this.logger.error(`[storage/remove] ${key}: ${messageOf(error)}`);
      throw new Error("File gagal dihapus", { cause: error });
    }
  }
}
