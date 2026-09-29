import nodemailer, { type Transporter } from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Where replies go instead of the no-reply sender, such as the admin who acted. */
  replyTo?: string;
}

const DEFAULT_FROM = "Mechanē <noreply@localhost>";
const RESEND_EMAILS_URL = "https://api.resend.com/emails";

let smtpTransportURL: string | null = null;
let smtpTransporter: Transporter | null = null;

function getSmtpTransporter(smtpUrl: string): Transporter {
  if (!smtpTransporter || smtpTransportURL !== smtpUrl) {
    smtpTransportURL = smtpUrl;
    smtpTransporter = nodemailer.createTransport(smtpUrl);
  }
  return smtpTransporter;
}

function fromAddress(): string {
  const from = process.env.EMAIL_FROM;
  if (from) return from;
  if (process.env.NODE_ENV === "production") {
    throw new Error("EMAIL_FROM is required in production.");
  }
  return DEFAULT_FROM;
}

async function sendWithSmtp(message: EmailMessage, smtpUrl: string): Promise<void> {
  const transporter = getSmtpTransporter(smtpUrl);
  await transporter.sendMail({
    from: fromAddress(),
    to: message.to,
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

async function sendWithResend(message: EmailMessage, apiKey: string): Promise<void> {
  const response = await fetch(RESEND_EMAILS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [message.to],
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });
  if (response.ok) return;

  const details = await response.text();
  throw new Error(`Resend rejected the email (${response.status}): ${details}`);
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const isTest = process.env.NODE_ENV === "test";
  if (isTest) {
    console.info(
      `[email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`,
    );
    return;
  }

  const smtpUrl = process.env.SMTP_URL || "smtp://localhost:1025";
  const resendApiKey = process.env.RESEND_API_KEY;

  if (process.env.NODE_ENV !== "production" && smtpUrl) {
    await sendWithSmtp(message, smtpUrl);
    return;
  }

  if (resendApiKey) {
    await sendWithResend(message, resendApiKey);
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("RESEND_API_KEY is required in production.");
  }

  console.info(
    `[email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`,
  );
}
