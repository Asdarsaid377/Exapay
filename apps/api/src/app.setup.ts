import type { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";

import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";

// Konfigurasi HTTP bersama untuk main.ts dan test e2e — agar test menguji perilaku yang sama dengan production
export function configureApp(app: INestApplication): void {
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
}
