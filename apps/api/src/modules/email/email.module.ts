import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer from "nodemailer";

import type { Env } from "../../common/config/env.js";
import { EMAIL_TRANSPORT, type EmailMessage, EmailService, type EmailTransport } from "./email.service.js";

function createSmtpTransport(config: ConfigService<Env, true>): EmailTransport {
  const user = config.get("SMTP_USER", { infer: true });
  const password = config.get("SMTP_PASSWORD", { infer: true });
  const from = config.get("SMTP_FROM", { infer: true });
  const port = config.get("SMTP_PORT", { infer: true });
  const transporter = nodemailer.createTransport({
    host: config.get("SMTP_HOST", { infer: true }),
    port,
    // 465 = TLS langsung; port lain (587) = STARTTLS. Production wajib TLS — kredensial relay tidak pernah terkirim polos.
    secure: port === 465,
    requireTLS: config.get("NODE_ENV", { infer: true }) === "production",
    auth: user && password ? { user, pass: password } : undefined,
  });

  return {
    async send(message: EmailMessage): Promise<void> {
      await transporter.sendMail({ from, ...message });
    },
  };
}

@Global()
@Module({
  providers: [
    { provide: EMAIL_TRANSPORT, inject: [ConfigService], useFactory: createSmtpTransport },
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
