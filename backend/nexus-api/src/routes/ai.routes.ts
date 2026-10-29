import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';

/**
 * POST /api/ai/listing-text
 * Writes the product summary + description with Claude. Key lives ONLY in ANTHROPIC_API_KEY.
 * Request : { title, category?, facts?, lang: 'fr'|'ar'|'en' }
 * Response: { success:true, summary, description }
 * Failure : { success:false, code, message } -> the frontend falls back to its local template.
 */
export const aiRouter = Router();

const URL_ = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 25_000;
const hits = new Map<string, number[]>();
function limited(key: string): boolean {
  const max = Number(process.env.WRITER_MAX_PER_MINUTE ?? 10);
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= max) { hits.set(key, recent); return true; }
  recent.push(now); hits.set(key, recent);
  return false;
}
const fail = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ success: false, code, message });

const LANGS: Record<string, string> = {
  fr: 'French (professional, natural business French)',
  ar: 'Modern Standard Arabic (فصحى مبسطة, natural, right-to-left, no transliteration of common words)',
  en: 'English (clear, professional business English)',
};

const SYSTEM = `You are a senior copywriter for a B2B marketplace in Algeria (medical, laboratory, cosmetics, industrial and professional products).
You write the listing text for ONE product: a short "summary" and a "description".

HARD RULES
- Use ONLY what is in the product name, category and the seller's facts. NEVER invent specifications, dosages, ingredients, certifications, standards, brands, origin, warranty, prices, stock or delivery promises.
- If the seller gave few facts, write shorter, honest text. Do not pad with vague marketing filler ("high quality", "reliable solution", "professional grade") unless it is backed by a given fact.
- Health products / medicines: neutral, factual tone. No cure, treatment or efficacy claims, no dosage advice. You may say it is used according to the label / a professional's advice.
- Summary: ONE sentence, max 130 characters, states what the product is and its main concrete benefit or use. Do not just repeat the product name and category.
- Description: 2 short paragraphs (max ~90 words total). Paragraph 1: what it is and who it is for. Paragraph 2: the concrete facts given by the seller (formats, sizes, uses...). If the seller listed several facts you may use a short list with "• ". Finish with one plain call to action to contact the seller for price, availability and delivery.
- Write in the requested language only. No emojis, no exclamation marks, no hashtags.
Reply with ONLY a JSON object, no markdown: {"summary":"...","description":"..."}`;

const SYSTEM_ORG = `You are a senior copywriter for a B2B marketplace in Algeria (medical, laboratory, cosmetics, industrial and professional products).
You write the profile text for ONE organization (a company, laboratory, clinic or supplier) that is a Featured partner: a short \"summary\" (tagline) and a \"description\" (presentation of the organization).

HARD RULES
- Use ONLY what is in the organization name, field of activity and the facts given. NEVER invent founding dates, number of employees, certifications, accreditations, awards, partners, clients, locations, product ranges or prices.
- If few facts were given, write shorter, honest text. No vague marketing filler (\"leader\", \"high quality\", \"trusted\") unless backed by a given fact.
- Health sector: neutral, factual tone. No cure, treatment or efficacy claims.
- Summary: ONE sentence, max 130 characters, says what the organization does and for whom. Do not just repeat the name and field.
- Description: 2 short paragraphs (max ~90 words total). Paragraph 1: who the organization is and what it does. Paragraph 2: the concrete facts given (activities, expertise, services, location, experience). Write in the third person or neutral \"we\" form, consistent across the text.
- Write in the requested language only. No emojis, no exclamation marks, no hashtags.
Reply with ONLY a JSON object, no markdown: {\"summary\":\"...\",\"description\":\"...\"}`;

aiRouter.post('/listing-text', requireAuth, async (req: Request, res: Response) => {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return fail(res, 503, 'not_configured', 'AI writing is not configured.');

  const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const title = clean(req.body?.title, 80);
  const category = clean(req.body?.category, 60);
  const facts = typeof req.body?.facts === 'string' ? req.body.facts.replace(/[ \t]+/g, ' ').trim().slice(0, 600) : '';
  const lang = typeof req.body?.lang === 'string' && LANGS[req.body.lang] ? req.body.lang : 'fr';
  const org = req.body?.kind === 'organization';
  if (!title) return fail(res, 400, 'bad_request', org ? 'Organization name is required.' : 'Product name is required.');
  if (limited(req.user!.id)) return fail(res, 429, 'rate_limited', 'Too many requests, try again in a minute.');

  const user = org
    ? `Language: ${LANGS[lang]}\nOrganization name: ${title}\nField of activity: ${category || '(not given)'}\nFacts given by the organization:\n${facts || '(none given)'}`
    : `Language: ${LANGS[lang]}\nProduct name: ${title}\nCategory: ${category || '(not given)'}\nSeller facts:\n${facts || '(none given)'}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.WRITER_MODEL?.trim() || process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-4-5-20251001', max_tokens: 600, temperature: 0.4, system: org ? SYSTEM_ORG : SYSTEM, messages: [{ role: 'user', content: user }] }),
      signal: ctrl.signal,
    });
    if (r.status === 429) return fail(res, 429, 'rate_limited', 'The AI service is rate-limited.');
    if (!r.ok) { console.warn('[writer] upstream status', r.status); return fail(res, 502, 'upstream_error', 'The AI service could not write the text.'); }
    const json: any = await r.json();
    const text: string = (json?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
    const m = /\{[\s\S]*\}/.exec(text);
    const raw: any = m ? JSON.parse(m[0]) : null;
    const summary = clean(raw?.summary, 140);
    const description = typeof raw?.description === 'string' ? raw.description.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 1200) : '';
    if (!summary || !description) return fail(res, 502, 'upstream_error', 'Unexpected AI response.');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, summary, description });
  } catch (err: any) {
    console.warn('[writer] request failed:', err?.name === 'AbortError' ? 'timeout' : err?.message);
    return fail(res, 502, 'upstream_error', 'The AI service is unavailable.');
  } finally {
    clearTimeout(timer);
  }
});
