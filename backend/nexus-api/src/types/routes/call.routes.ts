import { Router } from 'express';
import type { Response } from 'express';
import { createHmac, randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';

/**
 * Audio / video call signaling for the Messenger.
 *
 *   GET  /stream    Server-Sent Events channel. One per open browser tab; the server pushes
 *                   { type, threadId, callId, from, fromName, kind, data } events to it.
 *   POST /signal    { threadId, callId, type, kind?, data?, connId? }
 *                   type = offer | answer | ice | end | decline | busy | media
 *   GET  /config    ICE servers (STUN, plus TURN when configured in .env).
 *
 * This file only RELAYS WebRTC handshake messages (SDP + ICE candidates) between the two people
 * of a direct conversation. Audio and video never pass through this server: they travel
 * peer-to-peer (or through a TURN relay when the two networks cannot reach each other directly).
 *
 * Why SSE and not WebSocket: the rest of the Messenger is plain REST + cookie session, so this
 * adds no new dependency and reuses attachUser/requireAuth unchanged. Browsers reconnect an
 * EventSource on their own.
 *
 * Authorization (same rule as sending a message in chat.routes.ts): you can only signal inside a
 * conversation you take part in, and only while the two people are still connected (ACCEPTED).
 *
 * State is in memory (who is online right now). With several server instances behind a load
 * balancer, move `clients` to Redis pub/sub; for a single instance this is correct as it is.
 */
export const callRouter = Router();
callRouter.use(requireAuth);

type Client = { id: string; res: Response };
const clients = new Map<string, Set<Client>>(); // userId -> open SSE channels (one per tab)

const fail = (res: Response, status: number, message: string) =>
  res.status(status).json({ success: false, message });

function push(client: Client, event: string, payload: unknown) {
  client.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

const TYPES = new Set(['offer', 'answer', 'ice', 'end', 'decline', 'busy', 'media']);
const MAX_DATA_CHARS = 20_000; // an SDP is ~2-6 kB; anything bigger is not a call

// Tiny anti-abuse guard: at most 8 new calls per minute per person.
const recentOffers = new Map<string, number[]>();
function offerAllowed(userId: string) {
  const now = Date.now();
  const list = (recentOffers.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 8) return false;
  list.push(now);
  recentOffers.set(userId, list);
  return true;
}

// ---------------------------------------------------------------------------
// GET /stream
// ---------------------------------------------------------------------------
/** Graceful shutdown: tell every SSE client to reconnect (EventSource retries by itself) and end the streams. */
export function closeAllCallStreams() {
  for (const set of clients.values()) for (const c of set) { try { c.res.write('event: bye\ndata: {}\n\n'); c.res.end(); } catch { /* already closed */ } }
  clients.clear();
}

callRouter.get('/stream', (req, res) => {
  const me = req.user!.id;

  res.status(200).set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx: do not buffer this response
  });
  res.flushHeaders();
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);

  const client: Client = { id: randomUUID(), res };
  const set = clients.get(me) ?? new Set<Client>();
  set.add(client);
  clients.set(me, set);

  res.write('retry: 3000\n\n');
  push(client, 'hello', { connId: client.id });

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    const s = clients.get(me);
    if (!s) return;
    s.delete(client);
    if (s.size === 0) clients.delete(me);
  });
});

// ---------------------------------------------------------------------------
// POST /signal
// ---------------------------------------------------------------------------
callRouter.post('/signal', async (req, res) => {
  const me = req.user!;
  const { threadId, callId, type, kind, data, connId } = req.body ?? {};

  if (typeof threadId !== 'string' || typeof callId !== 'string' || callId.length > 64) {
    return fail(res, 400, 'Requête invalide.');
  }
  if (!TYPES.has(type)) return fail(res, 400, 'Type de signal inconnu.');
  if (data !== undefined && JSON.stringify(data).length > MAX_DATA_CHARS) {
    return fail(res, 413, 'Signal trop volumineux.');
  }

  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: { participants: true },
  });
  if (!thread || !thread.participants.some((p) => p.userId === me.id)) {
    return fail(res, 404, 'Conversation introuvable.');
  }
  const other = thread.participants.find((p) => p.userId !== me.id);
  if (!other) return fail(res, 404, 'Conversation introuvable.');

  // A hang-up must always get through, even if the connection was removed meanwhile.
  if (type === 'offer') {
    const link = await prisma.chatConnection.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requesterId: me.id, addresseeId: other.userId },
          { requesterId: other.userId, addresseeId: me.id },
        ],
      },
    });
    if (!link) return fail(res, 403, 'Vous n’êtes plus en contact avec cette personne.');
    if (!offerAllowed(me.id)) return fail(res, 429, 'Trop d’appels, réessayez dans une minute.');
  }

  const targets = clients.get(other.userId);
  const delivered = !!targets && targets.size > 0;
  const message = {
    type,
    threadId,
    callId,
    kind: kind === 'video' ? 'video' : 'audio',
    from: me.id,
    fromName: me.displayName,
    data,
  };
  targets?.forEach((c) => push(c, 'signal', message));

  // Answered/declined on one of my tabs → stop the ringing on my other tabs.
  if (type === 'answer' || type === 'decline') {
    clients.get(me.id)?.forEach((c) => {
      if (c.id !== connId) push(c, 'signal', { type: 'handled', threadId, callId });
    });
  }

  res.json({ success: true, delivered });
});

// ---------------------------------------------------------------------------
// GET /config — ICE servers
// ---------------------------------------------------------------------------
/**
 * STUN alone is enough on one LAN, but across two different networks (Wi-Fi vs 4G, two offices)
 * a TURN relay is usually required for media to flow. Configure it in server/.env:
 *
 *   TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349
 *   # EITHER fixed credentials (managed providers: Metered, Twilio, Xirsys…)
 *   TURN_USERNAME=...
 *   TURN_CREDENTIAL=...
 *   # OR a shared secret for self-hosted coturn (use-auth-secret / static-auth-secret):
 *   TURN_SECRET=...
 */
callRouter.get('/config', (req, res) => {
  const stun = (process.env.STUN_URLS ?? 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const iceServers: Array<{ urls: string[]; username?: string; credential?: string }> = [{ urls: stun }];

  const turnUrls = (process.env.TURN_URLS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (turnUrls.length > 0) {
    if (process.env.TURN_SECRET) {
      const username = `${Math.floor(Date.now() / 1000) + 6 * 3600}:${req.user!.id}`; // valid 6 h
      const credential = createHmac('sha1', process.env.TURN_SECRET).update(username).digest('base64');
      iceServers.push({ urls: turnUrls, username, credential });
    } else if (process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      iceServers.push({
        urls: turnUrls,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    }
  }

  res.json({ success: true, iceServers, hasTurn: iceServers.length > 1 });
});
