import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import type { Env } from "./common/config/env.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get("API_PORT", { infer: true });
  await app.listen(port, "0.0.0.0");
  Logger.log(`API berjalan di port ${port}`, "Bootstrap");
}

bootstrap().catch((error: unknown) => {
  Logger.error(error, "Bootstrap");
  process.exit(1);
});
