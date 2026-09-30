import { Global, Module } from "@nestjs/common";

import { FileStorage } from "./file-storage.js";
import { S3FileStorage } from "./s3-file-storage.js";

// Penyimpanan file privat (S3-compatible). Diinjeksi sebagai FileStorage agar provider bisa diganti.
@Global()
@Module({
  providers: [{ provide: FileStorage, useClass: S3FileStorage }],
  exports: [FileStorage],
})
export class StorageModule {}
