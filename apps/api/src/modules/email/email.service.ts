import { Inject, Injectable, Logger } from "@nestjs/common";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

// Abstraksi pengirim email. Implementasi saat ini SMTP (dev: Mailpit, prod: SMTP relay);
// provider lain cukup mengimplementasikan interface ini.
export type EmailTransport = {
  send(message: EmailMessage): Promise<void>;
};

export const EMAIL_TRANSPORT = Symbol("EMAIL_TRANSPORT");

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@Inject(EMAIL_TRANSPORT) private readonly transport: EmailTransport) {}

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transport.send(message);
    } catch (error: unknown) {
      this.logger.error(`[email/send] gagal mengirim "${message.subject}": ${error instanceof Error ? error.message : String(error)}`);
      throw new Error("Email gagal dikirim", { cause: error });
    }
  }
}
