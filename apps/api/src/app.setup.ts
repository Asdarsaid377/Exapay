import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import type { Express } from "express";

import type { Env } from "./common/config/env.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";

// Konfigurasi HTTP bersama untuk main.ts dan test e2e — agar test menguji perilaku yang sama dengan production
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const express: Express = app.getHttpAdapter().getInstance();
  express.set("trust proxy", config.get("TRUST_PROXY_HOPS", { infer: true }));
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
}
