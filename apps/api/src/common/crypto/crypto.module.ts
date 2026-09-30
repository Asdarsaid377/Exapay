import { Global, Module } from "@nestjs/common";

import { FieldCipher } from "./field-cipher.js";

// Global: data sensitif karyawan dibaca juga oleh modul lain nanti (mis. ekspor transfer bank payroll)
@Global()
@Module({
  providers: [FieldCipher],
  exports: [FieldCipher],
})
export class CryptoModule {}
