import nodemailer from 'nodemailer';

export function mailConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.SMTP_HOST && env.MAIL_FROM);
}

let cached: ReturnType<typeof nodemailer.createTransport> | null = null;
function transport() {
  if (cached) return cached;
  const port = Number(process.env.SMTP_PORT ?? 587);
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return cached;
}

/** Throws on delivery failure. Never logs bodies (they can contain reset links / health data). */
export async function sendMail(msg: { to: string; subject: string; text: string; replyTo?: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] }) {
  if (!mailConfigured()) throw new Error('MAIL_NOT_CONFIGURED');
  await transport().sendMail({ from: process.env.MAIL_FROM, ...msg });
}

export function resetMailTransportForTests() {
  cached = null;
}
