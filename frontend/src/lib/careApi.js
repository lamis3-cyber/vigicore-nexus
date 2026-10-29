// Lien médecin ↔ patient (consentement du patient) et déclarations partagées par les patients.
import { API_BASE } from './api';
async function call(method, path, body) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method, credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch { /* corps non JSON */ }
    return { httpStatus: res.status, json };
  } catch {
    return { httpStatus: 0, json: null };
  }
}
const doctorsResult = (r) => (r.httpStatus === 200
  ? { ok: true, doctors: r.json?.doctors ?? [] }
  : { ok: false, doctors: [], unauthorized: r.httpStatus === 401, message: r.json?.message });

/** Patient : mes médecins (dossier lié) et l'état de mon accord. */
export const listMyDoctors = async () => doctorsResult(await call('GET', '/care/doctors'));
export const acceptDoctor = async (doctorId) => doctorsResult(await call('POST', `/care/doctors/${encodeURIComponent(doctorId)}/accept`));
export const declineDoctor = async (doctorId) => doctorsResult(await call('POST', `/care/doctors/${encodeURIComponent(doctorId)}/decline`));

/** Médecin : déclarations que ses patients ont choisi de lui partager. */
export async function listFromPatients() {
  const r = await call('GET', '/records/from-patients');
  return r.httpStatus === 200 ? { ok: true, records: r.json?.records ?? [] } : { ok: false, records: [], unauthorized: r.httpStatus === 401 };
}
