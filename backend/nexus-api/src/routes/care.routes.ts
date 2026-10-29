/**
 * Lien médecin ↔ patient, côté patient.
 *   GET  /api/care/doctors                     mes médecins (dossier lié) et l'état de mon consentement
 *   POST /api/care/doctors/:doctorId/accept    j'accepte : ce médecin peut recevoir les déclarations que je partage
 *   POST /api/care/doctors/:doctorId/decline   je refuse / j'arrête le partage : le lien est retiré
 */
import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { doctorsOf, acceptDoctor, unlinkDoctor } from '../services/careLinks';

export const careRouter = Router();
careRouter.use(requireAuth);
const fail = (res: Response, status: number, message: string) => res.status(status).json({ success: false, message });
const patientOnly = (req: any, res: Response) => {
  if (req.user!.role !== 'PATIENT') { fail(res, 403, 'Réservé aux comptes patients.'); return false; }
  return true;
};

careRouter.get('/doctors', asyncHandler(async (req, res) => {
  if (!patientOnly(req, res)) return;
  res.json({ success: true, doctors: await doctorsOf(req.user!.id) });
}));

careRouter.post('/doctors/:doctorId/accept', asyncHandler(async (req, res) => {
  if (!patientOnly(req, res)) return;
  if (!(await acceptDoctor(req.user!.id, String(req.params.doctorId)))) return fail(res, 404, 'Médecin introuvable.');
  res.json({ success: true, doctors: await doctorsOf(req.user!.id) });
}));

careRouter.post('/doctors/:doctorId/decline', asyncHandler(async (req, res) => {
  if (!patientOnly(req, res)) return;
  if (!(await unlinkDoctor(req.user!.id, String(req.params.doctorId)))) return fail(res, 404, 'Médecin introuvable.');
  res.json({ success: true, doctors: await doctorsOf(req.user!.id) });
}));
