import { Router } from 'express';
import { contactLimiter } from '../lib/security';
import { mailConfigured, sendMail } from '../lib/email';
import { normalizeEmail, isValidEmail } from '../lib/email-address';

/**
 * POST /api/contact — public "request a demo / contact" form.
 * Delivered by e-mail to CONTACT_TO through the server's SMTP account (credentials never reach the browser).
 * Nothing is stored (data minimisation). Spam protection: per-IP rate limit, honeypot field `website`,
 * strict length limits, header-injection safe (values only go in the body, Reply-To is a validated address).
 */
export const contactRouter = Router();

const oneLine = (v: unknown, max: number) => clip(v, max).replace(/\s*[\r\n]+\s*/g, ' ');
const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max) : '');

contactRouter.post('/', contactLimiter, async (req, res) => {
  const b = req.body ?? {};
  // Honeypot: real users never see/fill `website`. Pretend success so bots learn nothing.
  if (typeof b.website === 'string' && b.website.trim() !== '') return res.json({ success: true });

  const to = process.env.CONTACT_TO?.trim();
  if (!mailConfigured() || !to) {
    return res.status(503).json({ success: false, code: 'CONTACT_NOT_CONFIGURED', message: 'The contact form is temporarily unavailable. Please try again later.' });
  }

  const name = oneLine(b.name, 120);
  const email = normalizeEmail(b.email);
  const message = clip(b.message, 4000);
  if (!name || !isValidEmail(email) || message.length < 5) {
    return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Name, a valid email and a message are required.' });
  }
  const text =
    `Nouvelle demande via le formulaire de contact\n\n` +
    `Nom : ${name}\nEmail : ${email}\nOrganisation : ${oneLine(b.organization, 160)}\nTéléphone : ${oneLine(b.phone, 40)}\n` +
    `Profil : ${oneLine(b.role, 80)}\nIntérêt : ${oneLine(b.interestedIn, 120)}\n\nMessage :\n${message}\n`;
  try {
    await sendMail({ to, subject: `Contact VigiCore NEXUS — ${name.replace(/[\r\n]+/g, ' ')}`, text, replyTo: email });
  } catch (e) {
    console.error('[contact] delivery failed:', (e as Error).message); // no payload in logs
    return res.status(502).json({ success: false, code: 'DELIVERY_FAILED', message: 'Your message could not be sent. Please try again later.' });
  }
  return res.json({ success: true });
});
