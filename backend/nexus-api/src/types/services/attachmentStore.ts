import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Conservation RÉELLE des pièces jointes d'un enregistrement Nexus.
 *  - Chiffrement AES-256-GCM (clé ATTACHMENT_ENC_KEY : 32 octets en hex (64 car.) ou base64). Aucun clair sur disque.
 *  - Dossier : <STORAGE_DIR>/attachments (défaut server/storage/attachments), un fichier opaque par pièce.
 *  - Sans clé valide, la conservation est DÉSACTIVÉE (isStorageEnabled() === false) : rien n'est écrit, et l'interface
 *    le dit. Il n'y a pas de repli en clair.
 * Format du fichier : iv(12) | tag(16) | chiffré.
 */
export function encryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = (env.ATTACHMENT_ENC_KEY ?? '').trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  try { const b = Buffer.from(raw, 'base64'); return b.length === 32 ? b : null; } catch { return null; }
}
export const isStorageEnabled = () => encryptionKey() !== null;

export const storageRoot = () =>
  process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR, 'attachments') : path.resolve(__dirname, '../../storage/attachments');

export interface StoredFile { storagePath: string; sizeBytes: number; sha256: string }

export async function storeEncrypted(data: Buffer): Promise<StoredFile> {
  const key = encryptionKey();
  if (!key) throw new Error('STORAGE_DISABLED');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(data), c.final()]);
  const blob = Buffer.concat([iv, c.getAuthTag(), enc]);
  const rel = `${crypto.randomUUID()}.enc`;
  await fs.promises.mkdir(storageRoot(), { recursive: true });
  await fs.promises.writeFile(path.join(storageRoot(), rel), blob, { mode: 0o600 });
  return { storagePath: rel, sizeBytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') };
}

export async function readDecrypted(storagePath: string): Promise<Buffer> {
  const key = encryptionKey();
  if (!key) throw new Error('STORAGE_DISABLED');
  // La clé de stockage vient de la base, jamais du client ; on refuse malgré tout tout chemin.
  if (storagePath !== path.basename(storagePath)) throw new Error('BAD_PATH');
  const blob = await fs.promises.readFile(path.join(storageRoot(), storagePath));
  const d = crypto.createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}
