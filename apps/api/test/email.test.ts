import { randomUUID } from "node:crypto";

import { ConfigModule, ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { envSchema } from "../src/common/config/env.js";
import { EmailModule } from "../src/modules/email/email.module.js";
import { EmailService } from "../src/modules/email/email.service.js";

// Verifikasi modul email: terkirim lewat SMTP ke Mailpit (dev). Butuh container mailpit jalan.
const MAILPIT_API = "http://localhost:8025/api/v1";

type MailpitMessage = { Subject: string; To: { Address: string }[] };

async function findMessage(subject: string): Promise<MailpitMessage | undefined> {
  const res = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`subject:"${subject}"`)}`);
  const body: unknown = await res.json();
  const messages: unknown = typeof body === "object" && body !== null ? Reflect.get(body, "messages") : undefined;
  if (!Array.isArray(messages)) return undefined;
  return messages.find((m: unknown): m is MailpitMessage => typeof m === "object" && m !== null && Reflect.get(m, "Subject") === subject);
}

describe("EmailService (SMTP → Mailpit)", () => {
  it("mengirim email", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validationSchema: envSchema }), EmailModule],
    }).compile();
    const email = moduleRef.get(EmailService);
    expect(moduleRef.get(ConfigService).get("SMTP_HOST")).toBeTruthy();

    const subject = `Uji Exapay ${randomUUID()}`;
    await email.send({ to: "penerima@test.exapay.local", subject, text: "Halo dari test" });

    const message = await findMessage(subject);
    expect(message?.To.map((t) => t.Address)).toEqual(["penerima@test.exapay.local"]);
    await moduleRef.close();
  });
});
