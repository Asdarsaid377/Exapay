import { SetMetadata } from "@nestjs/common";

export const ALLOW_WHEN_READ_ONLY_KEY = "allowWhenReadOnly";

// Mutasi yang tetap boleh saat usaha dalam mode baca-saja (feature 39): auth, aksi yang sebenarnya hanya membaca
// (buka data sensitif, pratinjau), dan aksi pengamanan (cabut akses). Tanpa dekorator → POST/PUT/DELETE ditolak 402.
export const AllowWhenReadOnly = (): MethodDecorator & ClassDecorator => SetMetadata(ALLOW_WHEN_READ_ONLY_KEY, true);
