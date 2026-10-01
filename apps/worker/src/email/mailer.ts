import nodemailer, { type Transporter } from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

// Abstraksi pengirim email worker (pemberitahuan slip gaji, feature 31). Implementasi SMTP (dev: Mailpit,
// prod: SMTP relay) — konfigurasi sama dengan EmailModule API.
export abstract class Mailer {
  abstract send(message: EmailMessage): Promise<void>;
}

export type SmtpConfig = {
  host: string;
  port: number;
  user: string | undefined;
  password: string | undefined;
  from: string;
};

export class SmtpMailer extends Mailer {
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpConfig) {
    super();
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.config.from, ...message });
  }

  // Dipanggil Nest saat worker berhenti
  onApplicationShutdown(): void {
    this.transporter.close();
  }
}
