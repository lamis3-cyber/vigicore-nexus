import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';

/**
 * POST /api/image/remove-background
 *
 * Server-side proxy to Bria RMBG 2.0. The Bria token lives ONLY in the
 * BRIA_API_TOKEN environment variable of this process; it is never sent to,
 * or readable by, the browser.
 *
 * Request  (JSON): { image: "data:image/(jpeg|png|webp);base64,..." }
 * Response (200) : image/png (transparent cutout, same pixel size as the input)
 * Failure        : JSON { success:false, code, message } — the frontend treats
 *                  ANY non-200 as "use the local IMG.LY fallback".
 *   503 not_configured  – BRIA_API_TOKEN missing
 *   429 rate_limited    – our per-user limiter, or Bria's own 429
 *   502 upstream_error  – Bria failed / timed out / returned garbage
 */
export const imageRouter = Router();

const BRIA_URL = 'https://engine.prod.bria-api.com/v2/image/edit/remove_background';
const TIMEOUT_MS = 12_000; // was 45 s; the browser gives up on the cloud at 15 s and falls back to the on-device model
const MAX_INPUT_BYTES = 2_200_000; // decoded image; the frontend sends a <=1024px JPEG (~0.2-0.6 MB)
const MAX_OUTPUT_BYTES = 12_000_000;

// Small in-memory limiter (per user): protects the paid API from loops/abuse.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = Number(process.env.BRIA_MAX_PER_MINUTE ?? 10);
const hits = new Map<string, number[]>();
function limited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) { hits.set(key, recent); return true; }
  recent.push(now); hits.set(key, recent);
  return false;
}

const fail = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ success: false, code, message });

imageRouter.post('/remove-background', requireAuth, async (req: Request, res: Response) => {
  const token = process.env.BRIA_API_TOKEN?.trim();
  if (!token) return fail(res, 503, 'not_configured', 'Cloud background removal is not configured.');

  const dataUrl = typeof req.body?.image === 'string' ? req.body.image : '';
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return fail(res, 400, 'bad_image', 'Send a JPEG, PNG or WebP image as a base64 data URL.');
  const b64 = m[2];
  if (Math.floor((b64.length * 3) / 4) > MAX_INPUT_BYTES) return fail(res, 413, 'too_large', 'The image is too large.');

  if (limited(req.user!.id)) return fail(res, 429, 'rate_limited', 'Too many requests, try again in a minute.');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const bria = await fetch(BRIA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', api_token: token },
      // Raw base64 (no data: prefix), synchronous mode: the response carries the final URL.
      body: JSON.stringify({ image: b64, sync: true }),
      signal: ctrl.signal,
    });
    if (bria.status === 429) return fail(res, 429, 'rate_limited', 'The cloud service is rate-limited.');
    if (!bria.ok) {
      console.warn('[bria] upstream status', bria.status);
      return fail(res, 502, 'upstream_error', 'The cloud service could not process this image.');
    }
    const json: any = await bria.json();
    const url: unknown = json?.result?.image_url;
    // Only follow an https URL returned by Bria (never something we did not expect).
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return fail(res, 502, 'upstream_error', 'Unexpected cloud response.');

    const img = await fetch(url, { signal: ctrl.signal });
    if (!img.ok) return fail(res, 502, 'upstream_error', 'Could not download the cutout.');
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length > MAX_OUTPUT_BYTES || buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) {
      return fail(res, 502, 'upstream_error', 'The cloud service returned an invalid image.');
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buf);
  } catch (err: any) {
    console.warn('[bria] request failed:', err?.name === 'AbortError' ? 'timeout' : err?.message);
    return fail(res, 502, 'upstream_error', 'The cloud service is unavailable.');
  } finally {
    clearTimeout(timer);
  }
});

/**
 * POST /api/image/advise
 *
 * "Photo advisor": a vision model looks at the ORIGINAL product photo and at the background-removed
 * version and decides which presentation looks best on a marketplace card:
 *   remove -> transparent cutout | keep -> keep the original photo | color -> cutout on a background colour
 * The key lives ONLY in ANTHROPIC_API_KEY (never sent to the browser). Optional: ANTHROPIC_MODEL
 * (default claude-haiku-4-5-20251001), ADVISE_MAX_PER_MINUTE (default 12).
 *
 * Request  (JSON): { original: dataUrl, cutout?: dataUrl, title?: string, category?: string }
 * Response (200) : { success:true, advice:{ decision, background, confidence, cutoutQuality, issues[], reason } }
 * Failure        : JSON { success:false, code, message } — the frontend then uses its on-device analysis.
 */
const ADVISE_URL = 'https://api.anthropic.com/v1/messages';
const ADVISE_TIMEOUT_MS = 15_000;
const ADVISE_MAX_IMG_BYTES = 900_000;
const adviseHits = new Map<string, number[]>();
function adviseLimited(key: string): boolean {
  const now = Date.now();
  const max = Number(process.env.ADVISE_MAX_PER_MINUTE ?? 12);
  const recent = (adviseHits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= max) { adviseHits.set(key, recent); return true; }
  recent.push(now); adviseHits.set(key, recent);
  return false;
}
const ISSUES = ['white_rim', 'missing_parts', 'jagged_edges', 'shadow_left', 'cut_off', 'low_resolution'] as const;
const PROMPT = `You are the art director of a B2B product marketplace with a modern, dark, premium look.
You get the ORIGINAL product photo and (usually) the same photo after automatic background removal, shown on mid-grey.
Decide the best presentation for a product card:
- "remove": transparent cutout. Choose it when the cutout is clean AND the original background is busy, dirty, low quality or distracting.
- "keep": keep the original photo. Choose it when the original already looks like a professional studio / lifestyle shot that is more attractive than a cutout, or when the cutout is damaged (missing parts, ragged edges, white rim, cut-off product).
- "color": cutout placed on a solid background colour. Choose it when the cutout is clean but would look flat/weak on transparent (e.g. white or very light or very dark products) and a well-chosen colour makes the product pop. Give "background" as a #RRGGBB colour that suits the product palette: soft, modern, low saturation, high contrast with the product edges.
Judge the cutout on: missing product parts, white/grey halo along the edges, jagged edges, leftover shadow, product cut off by the image border.
Reply with ONLY a JSON object, no markdown:
{"decision":"remove|keep|color","background":"#RRGGBB or null","confidence":0-1,"cutoutQuality":0-10,"issues":[any of ${ISSUES.map((i) => `"${i}"`).join(',')}],"reason":"one short sentence a shop owner understands, in English"}`;

imageRouter.post('/advise', requireAuth, async (req: Request, res: Response) => {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return fail(res, 503, 'not_configured', 'AI advice is not configured.');

  const parse = (v: unknown) => {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(typeof v === 'string' ? v : '');
    if (!m) return null;
    if (Math.floor((m[2].length * 3) / 4) > ADVISE_MAX_IMG_BYTES) return 'big' as const;
    return { media_type: `image/${m[1]}`, data: m[2] };
  };
  const orig = parse(req.body?.original);
  const cut = req.body?.cutout ? parse(req.body.cutout) : null;
  if (!orig || orig === 'big' || cut === 'big' || (req.body?.cutout && !cut)) return fail(res, 400, 'bad_image', 'Send small JPEG/PNG/WebP data URLs.');
  if (adviseLimited(req.user!.id)) return fail(res, 429, 'rate_limited', 'Too many requests, try again in a minute.');

  const ctx = [req.body?.title, req.body?.category].filter((s) => typeof s === 'string' && s.trim()).map((s: string) => s.trim().slice(0, 80)).join(' · ');
  const content: any[] = [
    { type: 'text', text: 'ORIGINAL photo:' },
    { type: 'image', source: { type: 'base64', ...orig } },
  ];
  if (cut) content.push({ type: 'text', text: 'AFTER background removal (shown on mid-grey):' }, { type: 'image', source: { type: 'base64', ...cut } });
  else content.push({ type: 'text', text: 'No cutout is available (background removal failed): choose between "keep" and "color" only if a cutout could not be judged; prefer "keep".' });
  if (ctx) content.push({ type: 'text', text: `Product: ${ctx}` });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ADVISE_TIMEOUT_MS);
  try {
    const r = await fetch(ADVISE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-4-5-20251001', max_tokens: 300, system: PROMPT, messages: [{ role: 'user', content }] }),
      signal: ctrl.signal,
    });
    if (r.status === 429) return fail(res, 429, 'rate_limited', 'The AI service is rate-limited.');
    if (!r.ok) { console.warn('[advise] upstream status', r.status); return fail(res, 502, 'upstream_error', 'The AI service could not process this image.'); }
    const json: any = await r.json();
    const text: string = (json?.content ?? []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
    const m = /\{[\s\S]*\}/.exec(text);
    const raw: any = m ? JSON.parse(m[0]) : null;
    if (!raw) return fail(res, 502, 'upstream_error', 'Unexpected AI response.');

    // Never trust the model's output shape: whitelist and clamp everything.
    const decision = ['remove', 'keep', 'color'].includes(raw.decision) ? raw.decision : null;
    if (!decision) return fail(res, 502, 'upstream_error', 'Unexpected AI response.');
    const background = typeof raw.background === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.background) ? raw.background.toLowerCase() : null;
    const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
    const advice = {
      decision: decision === 'color' && !background ? 'remove' : decision,
      background: decision === 'color' ? background : null,
      confidence: num(raw.confidence, 0, 1, 0.6),
      cutoutQuality: num(raw.cutoutQuality, 0, 10, 6),
      issues: Array.isArray(raw.issues) ? raw.issues.filter((i: unknown) => (ISSUES as readonly string[]).includes(i as string)) : [],
      reason: typeof raw.reason === 'string' ? raw.reason.replace(/\s+/g, ' ').trim().slice(0, 200) : '',
    };
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, advice });
  } catch (err: any) {
    console.warn('[advise] request failed:', err?.name === 'AbortError' ? 'timeout' : err?.message);
    return fail(res, 502, 'upstream_error', 'The AI service is unavailable.');
  } finally {
    clearTimeout(timer);
  }
});
