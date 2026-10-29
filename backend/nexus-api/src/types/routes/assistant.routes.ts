import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { answerQuestion } from '../services/assistant';

/**
 * POST   /api/assistant/chat                  { message, lang?, conversationId? } -> { reply, conversationId, ... }
 * GET    /api/assistant/conversations         discussions du compte (récentes d'abord)
 * GET    /api/assistant/conversations/:id     messages d'une discussion du compte
 * DELETE /api/assistant/conversations/:id     supprime une discussion du compte
 * Répond depuis la base pour l'utilisateur de la session uniquement ; chaque discussion appartient à un compte et
 * n'est lue/écrite que par lui (la portée ne vient jamais de la requête). Limité en fréquence par utilisateur.
 */
export const assistantRouter = Router();
assistantRouter.use(requireAuth);

const hits = new Map<string, number[]>();
function limited(key: string): boolean {
  const max = Number(process.env.ASSISTANT_MAX_PER_MINUTE ?? 30);
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((x) => now - x < 60_000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

const titleOf = (m: string) => (m.length > 60 ? `${m.slice(0, 57)}…` : m);

assistantRouter.get('/conversations', asyncHandler(async (req, res) => {
  const rows: any[] = await prisma.assistantConversation.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: 'desc' }, take: 50 });
  res.json({ success: true, conversations: rows.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })) });
}));

async function ownConversation(userId: string, id: string) {
  const c: any = await prisma.assistantConversation.findFirst({ where: { id, userId } });
  return c ?? null;
}

assistantRouter.get('/conversations/:id', asyncHandler(async (req, res) => {
  const c = await ownConversation(req.user!.id, String(req.params.id));
  if (!c) return res.status(404).json({ success: false, message: 'Discussion introuvable.' });
  const msgs: any[] = await prisma.assistantMessage.findMany({ where: { conversationId: c.id }, orderBy: { createdAt: 'asc' }, take: 500 });
  res.json({ success: true, conversation: { id: c.id, title: c.title }, messages: msgs.map((m) => ({ from: m.role === 'user' ? 'user' : 'ai', text: m.text, ts: m.createdAt })) });
}));

assistantRouter.delete('/conversations/:id', asyncHandler(async (req, res) => {
  const c = await ownConversation(req.user!.id, String(req.params.id));
  if (!c) return res.status(404).json({ success: false, message: 'Discussion introuvable.' });
  await prisma.assistantMessage.deleteMany({ where: { conversationId: c.id } });
  await prisma.assistantConversation.delete({ where: { id: c.id } });
  res.json({ success: true });
}));

assistantRouter.post('/chat', asyncHandler(async (req, res) => {
  const user = req.user!;
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ success: false, message: 'Message vide.' });
  if (message.length > 500) return res.status(400).json({ success: false, message: 'Message trop long (500 caractères max).' });
  if (limited(user.id)) return res.status(429).json({ success: false, message: 'Trop de questions, réessayez dans une minute.' });

  let conv: any = null;
  if (typeof req.body?.conversationId === 'string' && req.body.conversationId) {
    conv = await ownConversation(user.id, req.body.conversationId);
    if (!conv) return res.status(404).json({ success: false, message: 'Discussion introuvable.' });
  }
  const history: any[] = conv
    ? (await prisma.assistantMessage.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'desc' }, take: 10 })).reverse()
    : [];

  const lang = req.body?.lang === 'ar' ? 'ar' : req.body?.lang === 'en' ? 'en' : 'fr';
  const reply = await answerQuestion(user, message, lang, history.map((m) => ({ role: m.role, text: m.text })));

  // Historique : enregistré seulement une fois la réponse prête ; un échec d'enregistrement ne bloque pas la réponse.
  let conversationId: string | null = conv?.id ?? null;
  try {
    if (!conv) conv = await prisma.assistantConversation.create({ data: { userId: user.id, title: titleOf(message) } });
    conversationId = conv.id;
    await prisma.assistantMessage.create({ data: { conversationId: conv.id, role: 'user', text: message } });
    await prisma.assistantMessage.create({ data: { conversationId: conv.id, role: 'ai', text: reply.text } });
    await prisma.assistantConversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
  } catch { /* historique indisponible : la réponse reste servie */ }
  res.json({ success: true, reply: reply.text, intents: reply.intents, understood: reply.understood, conversationId });
}));
