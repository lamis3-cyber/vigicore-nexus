/**
 * Lien médecin ↔ patient.
 *  - Le médecin ajoute un patient avec son e-mail (dossier DashboardPatient) ; si le compte patient existe, le dossier est lié
 *    (payload.patientUserId) et une demande de contact est envoyée. Si le patient crée son compte PLUS TARD, le lien est fait
 *    ici, à l'inscription (et, pour les comptes plus anciens, à la connexion).
 *  - Le CONSENTEMENT du patient = la demande de contact ACCEPTÉE. Il peut refuser ou arrêter le partage à tout moment :
 *    le lien est retiré du dossier du médecin (qui garde ses propres notes) et la connexion supprimée.
 *  - Seuls les médecins acceptés peuvent recevoir les déclarations que le patient choisit de partager.
 */
import { prisma } from '../lib/prisma';

const db = prisma as any;
const norm = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '');

async function connectionBetween(a: string, b: string) {
  return db.chatConnection.findFirst({ where: { OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] } });
}

/** Lie au compte patient les dossiers créés par des médecins avec cet e-mail ; crée les demandes de contact manquantes. */
export async function linkPatientAccount(patientId: string, email: string): Promise<number> {
  const target = norm(email);
  if (!target) return 0;
  const rows: any[] = await db.dashboardPatient.findMany({ where: { archivedAt: null }, select: { id: true, ownerUserId: true, payload: true } });
  let linked = 0;
  for (const r of rows) {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    if (norm(p.email) !== target || p.patientUserId || p.unlinkedByPatientAt) continue;
    await db.dashboardPatient.update({ where: { id: r.id }, data: { payload: { ...p, patientUserId: patientId } } });
    if (!(await connectionBetween(r.ownerUserId, patientId))) {
      await db.chatConnection.create({ data: { requesterId: r.ownerUserId, addresseeId: patientId } });
    }
    linked++;
  }
  return linked;
}

export type MyDoctor = {
  doctorId: string; displayName: string; establishment: string | null;
  status: 'PENDING' | 'ACCEPTED'; since: string;
};

/** Médecins dont un dossier (actif) est lié au patient, avec l'état du consentement. */
export async function doctorsOf(patientId: string): Promise<MyDoctor[]> {
  const rows: any[] = await db.dashboardPatient.findMany({ where: { archivedAt: null }, select: { ownerUserId: true, payload: true, establishmentId: true, createdAt: true } });
  const mine = rows.filter((r) => (r.payload as any)?.patientUserId === patientId);
  const byDoctor = new Map<string, any>();
  for (const r of mine) if (!byDoctor.has(r.ownerUserId)) byDoctor.set(r.ownerUserId, r);
  const out: MyDoctor[] = [];
  for (const [doctorId, r] of byDoctor) {
    const [doc, conn, est] = await Promise.all([
      db.user.findUnique({ where: { id: doctorId } }),
      connectionBetween(doctorId, patientId),
      r.establishmentId ? db.establishment.findFirst({ where: { id: r.establishmentId } }) : null,
    ]);
    if (!doc || doc.deactivatedAt) continue;
    out.push({
      doctorId, displayName: doc.displayName,
      establishment: est && !est.isSystemReserved ? est.name : null,
      status: conn?.status === 'ACCEPTED' ? 'ACCEPTED' : 'PENDING',
      since: new Date(r.createdAt).toISOString(),
    });
  }
  return out.sort((a, b) => (a.status === b.status ? a.displayName.localeCompare(b.displayName) : a.status === 'PENDING' ? -1 : 1));
}

/** Médecins ACCEPTÉS par le patient (dossier lié + demande de contact acceptée). */
export async function acceptedDoctorIds(patientId: string): Promise<Set<string>> {
  return new Set((await doctorsOf(patientId)).filter((d) => d.status === 'ACCEPTED').map((d) => d.doctorId));
}

export async function acceptDoctor(patientId: string, doctorId: string): Promise<boolean> {
  const linked = (await doctorsOf(patientId)).some((d) => d.doctorId === doctorId);
  if (!linked) return false;
  const conn = await connectionBetween(doctorId, patientId);
  if (conn) {
    if (conn.status !== 'ACCEPTED') await db.chatConnection.update({ where: { id: conn.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
  } else {
    await db.chatConnection.create({ data: { requesterId: doctorId, addresseeId: patientId, status: 'ACCEPTED', respondedAt: new Date() } });
  }
  return true;
}

/** Refus ou arrêt du partage : le dossier du médecin n'est plus lié au compte, la connexion est supprimée. */
export async function unlinkDoctor(patientId: string, doctorId: string): Promise<boolean> {
  const rows: any[] = await db.dashboardPatient.findMany({ where: { ownerUserId: doctorId }, select: { id: true, payload: true } });
  let changed = false;
  for (const r of rows) {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    if (p.patientUserId !== patientId) continue;
    const { patientUserId: _drop, ...rest } = p;
    await db.dashboardPatient.update({ where: { id: r.id }, data: { payload: { ...rest, unlinkedByPatientAt: new Date().toISOString() } } });
    changed = true;
  }
  const conn = await connectionBetween(doctorId, patientId);
  if (conn) { await db.chatConnection.delete({ where: { id: conn.id } }); changed = true; }
  return changed;
}

/** Un médecin peut-il lire cette déclaration patient ? (partagée avec lui ET consentement toujours actif) */
export async function doctorMayRead(row: any, doctorId: string): Promise<boolean> {
  const fields = Array.isArray(row?.payload) ? row.payload : [];
  if (fields.find((f: any) => f.key === 'recordKind')?.value !== 'PATIENT') return false;
  const shared = fields.find((f: any) => f.key === 'sharedWithDoctors')?.value;
  if (!Array.isArray(shared) || !shared.includes(doctorId)) return false;
  return (await acceptedDoctorIds(row.authorUserId)).has(doctorId);
}
