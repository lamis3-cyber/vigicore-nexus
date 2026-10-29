import { Router } from 'express';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { Prisma, Role } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';

/**
 * Messenger API — people-to-people chat shared by every dashboard's "Messages" page.
 *
 *   GET    /people?q=              search people to add (professionals by name, patients ONLY by exact email)
 *   GET    /suggestions            people from your own organization you are not connected to yet
 *   GET    /connections            { friends, incoming, outgoing }
 *   POST   /connections            { userId }  send a request (auto-accepts when they already asked you)
 *   POST   /connections/:id/accept | /decline ; DELETE /connections/:id (cancel a request / remove a colleague)
 *   GET    /threads                my conversations (other person, last message, unread count)
 *   POST   /threads                { userId }  open (or create) the direct conversation with a colleague
 *   GET    /threads/:id/messages   latest messages of a conversation
 *   POST   /threads/:id/messages   { body?, fileId?, replyToId? }
 *   POST   /threads/:id/read       mark the conversation as read
 *   DELETE /messages/:id           delete one of my messages
 *   POST   /files?threadId=&name=&mime=&voice=&durationMs=   raw body (application/octet-stream)
 *   GET    /files/:id              download / stream an attachment (participants only)
 *   GET    /unread                 total unread messages (badge)
 *
 * Messaging requires an ACCEPTED connection between the two people. Every response follows the
 * { success, ... } / { success: false, message } contract of the rest of the API.
 */
export const chatRouter = Router();
chatRouter.use(requireAuth);

const MAX_BODY = 4000;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const MESSAGE_WINDOW = 150;
// Persistent volume in production: set STORAGE_DIR (default: server/storage/chat next to the code).
const STORAGE_DIR = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR, 'chat') : path.resolve(__dirname, '../../storage/chat');

const fail = (res: Response, status: number, message: string) =>
  res.status(status).json({ success: false, message });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CardSource = {
  id: string;
  displayName: string;
  role: string;
  affiliations: { isActiveContext: boolean; establishment: { name: string; isSystemReserved: boolean } }[];
};

const CARD_SELECT = {
  id: true,
  displayName: true,
  role: true,
  affiliations: {
    where: { status: 'ACTIVE' },
    select: { isActiveContext: true, establishment: { select: { name: true, isSystemReserved: true } } },
  },
} as const;

/** What the other side may see of a person: never an e-mail address. */
function toCard(u: CardSource) {
  const real = u.affiliations.filter((a) => !a.establishment.isSystemReserved);
  const home = real.find((a) => a.isActiveContext) ?? real[0];
  return { id: u.id, displayName: u.displayName, role: u.role, organization: home?.establishment.name ?? null };
}

const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

async function findConnection(a: string, b: string) {
  return prisma.chatConnection.findFirst({
    where: { OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] },
  });
}

async function connectedIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.chatConnection.findMany({
    where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  return new Set(rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId)));
}

/** The conversation, only if `userId` takes part in it. */
async function myThread(threadId: string, userId: string) {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: { participants: true },
  });
  if (!thread || !thread.participants.some((p) => p.userId === userId)) return null;
  return thread;
}

const snippet = (s: string | null | undefined, n = 90) => (s ? (s.length > n ? `${s.slice(0, n)}…` : s) : '');

const kindOf = (m: { file: { isVoice: boolean } | null }) => (m.file ? (m.file.isVoice ? 'VOICE' : 'FILE') : 'TEXT');

type MessageRow = {
  id: string;
  threadId: string;
  senderId: string;
  body: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  file: { id: string; name: string; mime: string; size: number; isVoice: boolean; durationMs: number | null } | null;
  replyTo: {
    id: string;
    senderId: string;
    body: string | null;
    deletedAt: Date | null;
    file: { isVoice: boolean } | null;
  } | null;
};

function toMessage(m: MessageRow) {
  const deleted = m.deletedAt !== null;
  return {
    id: m.id,
    threadId: m.threadId,
    senderId: m.senderId,
    kind: kindOf(m),
    body: deleted ? null : m.body,
    deleted,
    createdAt: m.createdAt,
    file:
      !deleted && m.file
        ? { id: m.file.id, name: m.file.name, mime: m.file.mime, size: m.file.size, durationMs: m.file.durationMs }
        : null,
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          senderId: m.replyTo.senderId,
          kind: kindOf(m.replyTo),
          body: m.replyTo.deletedAt ? null : snippet(m.replyTo.body),
          deleted: m.replyTo.deletedAt !== null,
        }
      : null,
  };
}

const MESSAGE_INCLUDE = {
  file: true,
  replyTo: { select: { id: true, senderId: true, body: true, deletedAt: true, file: { select: { isVoice: true } } } },
} as const;

// ---------------------------------------------------------------------------
// People: search + suggestions
// ---------------------------------------------------------------------------

/** relation of `me` to each of `ids`: none | connected | sent | received (+ connectionId). */
async function relationsTo(meId: string, ids: string[]) {
  const rows = ids.length
    ? await prisma.chatConnection.findMany({
        where: {
          OR: [
            { requesterId: meId, addresseeId: { in: ids } },
            { addresseeId: meId, requesterId: { in: ids } },
          ],
        },
      })
    : [];
  const map = new Map<string, { relation: string; connectionId: string }>();
  for (const r of rows) {
    const other = r.requesterId === meId ? r.addresseeId : r.requesterId;
    const relation = r.status === 'ACCEPTED' ? 'connected' : r.requesterId === meId ? 'sent' : 'received';
    map.set(other, { relation, connectionId: r.id });
  }
  return map;
}

chatRouter.get('/people', async (req, res, next) => {
  try {
    const me = req.user!;
    const q = String(req.query.q ?? '').trim().slice(0, 80);
    if (q.length < 2) return res.json({ success: true, people: [] });

    // Privacy: professionals can be found by name; patients only by their exact e-mail address,
    // so the Site never behaves like a directory of patients.
    const or: Prisma.UserWhereInput[] = [{ AND: [{ role: { not: 'PATIENT' as Role } }, { displayName: { contains: q } }] }];
    if (q.includes('@')) or.push({ email: q.toLowerCase() });

    const users = await prisma.user.findMany({
      where: { id: { not: me.id }, OR: or },
      orderBy: { displayName: 'asc' },
      take: 20,
      select: CARD_SELECT,
    });
    const rel = await relationsTo(me.id, users.map((u) => u.id));
    res.json({
      success: true,
      people: users.map((u) => ({ ...toCard(u), ...(rel.get(u.id) ?? { relation: 'none', connectionId: null }) })),
    });
  } catch (err) {
    next(err);
  }
});

chatRouter.get('/suggestions', async (req, res, next) => {
  try {
    const me = req.user!;
    if (me.affiliatedEstablishmentIds.length === 0) return res.json({ success: true, people: [] });
    const users = await prisma.user.findMany({
      where: {
        id: { not: me.id },
        affiliations: {
          some: {
            establishmentId: { in: me.affiliatedEstablishmentIds },
            status: 'ACTIVE',
            establishment: { isSystemReserved: false },
          },
        },
      },
      orderBy: { displayName: 'asc' },
      take: 40,
      select: CARD_SELECT,
    });
    const rel = await relationsTo(me.id, users.map((u) => u.id));
    const people = users
      .filter((u) => !rel.has(u.id))
      .slice(0, 12)
      .map((u) => ({ ...toCard(u), relation: 'none', connectionId: null }));
    res.json({ success: true, people });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Connections ("colleagues")
// ---------------------------------------------------------------------------

chatRouter.get('/connections', async (req, res, next) => {
  try {
    const me = req.user!;
    const rows = await prisma.chatConnection.findMany({
      where: { OR: [{ requesterId: me.id }, { addresseeId: me.id }] },
      orderBy: { createdAt: 'desc' },
      include: { requester: { select: CARD_SELECT }, addressee: { select: CARD_SELECT } },
    });
    const friends: object[] = [];
    const incoming: object[] = [];
    const outgoing: object[] = [];
    for (const r of rows) {
      const iAmRequester = r.requesterId === me.id;
      const entry = { connectionId: r.id, createdAt: r.createdAt, user: toCard(iAmRequester ? r.addressee : r.requester) };
      if (r.status === 'ACCEPTED') friends.push(entry);
      else if (iAmRequester) outgoing.push(entry);
      else incoming.push(entry);
    }
    friends.sort((a: any, b: any) => a.user.displayName.localeCompare(b.user.displayName));
    res.json({ success: true, friends, incoming, outgoing });
  } catch (err) {
    next(err);
  }
});

chatRouter.post('/connections', async (req, res, next) => {
  try {
    const me = req.user!;
    const userId = typeof req.body?.userId === 'string' ? req.body.userId : '';
    if (!userId || userId === me.id) return fail(res, 400, 'Choisissez une autre personne.');
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) return fail(res, 404, 'Personne introuvable.');

    const existing = await findConnection(me.id, userId);
    if (existing) {
      // They already asked me: sending a request back simply accepts theirs.
      if (existing.status === 'PENDING' && existing.addresseeId === me.id) {
        const accepted = await prisma.chatConnection.update({
          where: { id: existing.id },
          data: { status: 'ACCEPTED', respondedAt: new Date() },
        });
        return res.json({ success: true, connection: { id: accepted.id, status: accepted.status } });
      }
      return res.json({ success: true, connection: { id: existing.id, status: existing.status } });
    }
    const created = await prisma.chatConnection.create({ data: { requesterId: me.id, addresseeId: userId } });
    res.status(201).json({ success: true, connection: { id: created.id, status: created.status } });
  } catch (err) {
    next(err);
  }
});

chatRouter.post('/connections/:id/accept', async (req, res, next) => {
  try {
    const me = req.user!;
    const row = await prisma.chatConnection.findUnique({ where: { id: req.params.id } });
    if (!row || row.addresseeId !== me.id) return fail(res, 404, 'Demande introuvable.');
    if (row.status === 'PENDING') {
      await prisma.chatConnection.update({
        where: { id: row.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

chatRouter.post('/connections/:id/decline', async (req, res, next) => {
  try {
    const me = req.user!;
    const row = await prisma.chatConnection.findUnique({ where: { id: req.params.id } });
    if (!row || row.addresseeId !== me.id || row.status !== 'PENDING') return fail(res, 404, 'Demande introuvable.');
    await prisma.chatConnection.delete({ where: { id: row.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

chatRouter.delete('/connections/:id', async (req, res, next) => {
  try {
    const me = req.user!;
    const row = await prisma.chatConnection.findUnique({ where: { id: req.params.id } });
    if (!row || (row.requesterId !== me.id && row.addresseeId !== me.id)) return fail(res, 404, 'Contact introuvable.');
    await prisma.chatConnection.delete({ where: { id: row.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

chatRouter.get('/threads', async (req, res, next) => {
  try {
    const me = req.user!;
    const mine = await prisma.chatParticipant.findMany({
      where: { userId: me.id },
      include: {
        thread: {
          include: {
            participants: { include: { user: { select: CARD_SELECT } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { file: true } },
          },
        },
      },
    });
    const friends = await connectedIds(me.id);
    const threads = await Promise.all(
      mine.map(async (p) => {
        const other = p.thread.participants.find((x) => x.userId !== me.id);
        if (!other) return null;
        const last = p.thread.messages[0] ?? null;
        const unread = await prisma.chatMessage.count({
          where: { threadId: p.threadId, senderId: { not: me.id }, deletedAt: null, createdAt: { gt: p.lastReadAt } },
        });
        return {
          id: p.threadId,
          user: toCard(other.user),
          connected: friends.has(other.userId),
          unread,
          updatedAt: p.thread.updatedAt,
          last: last
            ? {
                kind: kindOf(last),
                body: last.deletedAt ? null : snippet(last.body, 80),
                deleted: last.deletedAt !== null,
                mine: last.senderId === me.id,
                createdAt: last.createdAt,
              }
            : null,
        };
      }),
    );
    const list = threads.filter((t): t is NonNullable<typeof t> => t !== null);
    list.sort((a, b) => +new Date(b.last?.createdAt ?? b.updatedAt) - +new Date(a.last?.createdAt ?? a.updatedAt));
    res.json({ success: true, threads: list });
  } catch (err) {
    next(err);
  }
});

chatRouter.post('/threads', async (req, res, next) => {
  try {
    const me = req.user!;
    const userId = typeof req.body?.userId === 'string' ? req.body.userId : '';
    if (!userId || userId === me.id) return fail(res, 400, 'Choisissez une autre personne.');
    if (!(await connectedIds(me.id)).has(userId)) {
      return fail(res, 403, 'Vous devez d’abord être en contact avec cette personne.');
    }
    const directKey = pairKey(me.id, userId);
    const thread = await prisma.chatThread.upsert({ where: { directKey }, update: {}, create: { directKey } });
    for (const uid of [me.id, userId]) {
      await prisma.chatParticipant.upsert({
        where: { threadId_userId: { threadId: thread.id, userId: uid } },
        update: {},
        create: { threadId: thread.id, userId: uid },
      });
    }
    res.json({ success: true, threadId: thread.id });
  } catch (err) {
    next(err);
  }
});

chatRouter.get('/threads/:id/messages', async (req, res, next) => {
  try {
    const me = req.user!;
    const thread = await myThread(req.params.id, me.id);
    if (!thread) return fail(res, 404, 'Conversation introuvable.');
    const rows = await prisma.chatMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'desc' },
      take: MESSAGE_WINDOW,
      include: MESSAGE_INCLUDE,
    });
    res.json({ success: true, messages: rows.reverse().map(toMessage) });
  } catch (err) {
    next(err);
  }
});

chatRouter.post('/threads/:id/messages', async (req, res, next) => {
  try {
    const me = req.user!;
    const thread = await myThread(req.params.id, me.id);
    if (!thread) return fail(res, 404, 'Conversation introuvable.');
    const other = thread.participants.find((p) => p.userId !== me.id);
    if (!other || !(await connectedIds(me.id)).has(other.userId)) {
      return fail(res, 403, 'Vous n’êtes plus en contact avec cette personne.');
    }

    const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, MAX_BODY) : '';
    const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId : '';
    const replyToId = typeof req.body?.replyToId === 'string' ? req.body.replyToId : '';
    if (!body && !fileId) return fail(res, 400, 'Message vide.');

    if (fileId) {
      const file = await prisma.chatFile.findUnique({ where: { id: fileId } });
      if (!file || file.uploaderId !== me.id || file.threadId !== thread.id || file.messageId) {
        return fail(res, 400, 'Fichier invalide.');
      }
    }
    if (replyToId) {
      const target = await prisma.chatMessage.findUnique({ where: { id: replyToId }, select: { threadId: true } });
      if (!target || target.threadId !== thread.id) return fail(res, 400, 'Message cité introuvable.');
    }

    const created = await prisma.chatMessage.create({
      data: { threadId: thread.id, senderId: me.id, body: body || null, replyToId: replyToId || null },
    });
    if (fileId) await prisma.chatFile.update({ where: { id: fileId }, data: { messageId: created.id } });
    await prisma.chatThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
    await prisma.chatParticipant.update({
      where: { threadId_userId: { threadId: thread.id, userId: me.id } },
      data: { lastReadAt: new Date() },
    });

    const full = await prisma.chatMessage.findUnique({ where: { id: created.id }, include: MESSAGE_INCLUDE });
    res.status(201).json({ success: true, message: toMessage(full!) });
  } catch (err) {
    next(err);
  }
});

chatRouter.post('/threads/:id/read', async (req, res, next) => {
  try {
    const me = req.user!;
    const thread = await myThread(req.params.id, me.id);
    if (!thread) return fail(res, 404, 'Conversation introuvable.');
    await prisma.chatParticipant.update({
      where: { threadId_userId: { threadId: thread.id, userId: me.id } },
      data: { lastReadAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

chatRouter.get('/unread', async (req, res, next) => {
  try {
    const me = req.user!;
    const mine = await prisma.chatParticipant.findMany({ where: { userId: me.id } });
    const counts = await Promise.all(
      mine.map((p) =>
        prisma.chatMessage.count({
          where: { threadId: p.threadId, senderId: { not: me.id }, deletedAt: null, createdAt: { gt: p.lastReadAt } },
        }),
      ),
    );
    res.json({ success: true, count: counts.reduce((a, b) => a + b, 0) });
  } catch (err) {
    next(err);
  }
});

chatRouter.delete('/messages/:id', async (req, res, next) => {
  try {
    const me = req.user!;
    const msg = await prisma.chatMessage.findUnique({ where: { id: req.params.id }, include: { file: true } });
    if (!msg || msg.senderId !== me.id) return fail(res, 404, 'Message introuvable.');
    if (!msg.deletedAt) {
      await prisma.chatMessage.update({ where: { id: msg.id }, data: { deletedAt: new Date(), body: null } });
      if (msg.file) {
        await fs.promises.unlink(path.join(STORAGE_DIR, msg.file.storageKey)).catch(() => undefined);
      }
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Files (attachments + voice notes)
// ---------------------------------------------------------------------------

const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
// Types the browser may display/play in place. Everything else is always served as a download.
const INLINE_MIME_RE = /^(audio\/[a-z0-9.+-]+|image\/(png|jpeg|gif|webp)|application\/pdf)$/i;

const cleanName = (raw: string) =>
  raw
    .replace(/[\\/\u0000-\u001f"<>|?*:]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120) || 'fichier';

chatRouter.post(
  '/files',
  express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
  async (req, res, next) => {
    try {
      const me = req.user!;
      const threadId = String(req.query.threadId ?? '');
      const thread = await myThread(threadId, me.id);
      if (!thread) return fail(res, 404, 'Conversation introuvable.');
      const other = thread.participants.find((p) => p.userId !== me.id);
      if (!other || !(await connectedIds(me.id)).has(other.userId)) {
        return fail(res, 403, 'Vous n’êtes plus en contact avec cette personne.');
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) return fail(res, 400, 'Fichier vide.');

      const mimeIn = String(req.query.mime ?? '').split(';')[0].trim();
      const mime = MIME_RE.test(mimeIn) ? mimeIn.toLowerCase() : 'application/octet-stream';
      const isVoice = req.query.voice === '1' && mime.startsWith('audio/');
      const durationRaw = Number(req.query.durationMs);
      const durationMs = isVoice && Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : null;

      await fs.promises.mkdir(STORAGE_DIR, { recursive: true });
      const storageKey = randomUUID();
      await fs.promises.writeFile(path.join(STORAGE_DIR, storageKey), req.body);

      const file = await prisma.chatFile.create({
        data: {
          uploaderId: me.id,
          threadId: thread.id,
          name: cleanName(String(req.query.name ?? 'fichier')),
          mime,
          size: req.body.length,
          isVoice,
          durationMs,
          storageKey,
        },
      });
      res.status(201).json({ success: true, file: { id: file.id, name: file.name, mime: file.mime, size: file.size } });
    } catch (err) {
      next(err);
    }
  },
);

chatRouter.get('/files/:id', async (req, res, next) => {
  try {
    const me = req.user!;
    const file = await prisma.chatFile.findUnique({ where: { id: req.params.id }, include: { message: true } });
    if (!file || !file.message || file.message.deletedAt) return fail(res, 404, 'Fichier introuvable.');
    if (!(await myThread(file.threadId, me.id))) return fail(res, 404, 'Fichier introuvable.');

    const inline = INLINE_MIME_RE.test(file.mime);
    res.setHeader('Content-Type', inline ? file.mime : 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const ascii = file.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    res.setHeader(
      'Content-Disposition',
      `${inline && req.query.download !== '1' ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    // sendFile handles Range requests, which audio seeking relies on.
    res.sendFile(path.join(STORAGE_DIR, file.storageKey), (err) => {
      if (err && !res.headersSent) fail(res, 404, 'Fichier introuvable.');
    });
  } catch (err) {
    next(err);
  }
});

// Uploads above the size limit arrive here as a body-parser error.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
chatRouter.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err?.type === 'entity.too.large') return fail(res, 413, 'Fichier trop volumineux (20 Mo maximum).');
  next(err);
});
