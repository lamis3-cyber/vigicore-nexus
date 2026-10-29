import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { tr } from '../../i18n/translate.js';
import { precursorsText, clinicalText } from '../lib/declarationModel';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { listMySubmissions as listMine, getSubmissionDetail as getDeclaration, retryDeclaration, getMessages, sendMessage, listMyRecords, getRecord, actOnRecord } from '../../lib/declarationsApi';
import {
  presentStatus, canRetry, canMessage, mergeMessages, latestSentAt, unreadCount,
  validateMessage, newIdempotencyKey, readSeen, writeSeen, describeRetry, shorten, MAX_MESSAGE,
  presentRecordStatus, RECORD_KIND_LABEL, canWithdrawRecord, recordTitle, recordField,
} from '../lib/myDeclarations';

// « Mes envois à la vigilance » : les déclarations ENVOYÉES PAR L'UTILISATEUR CONNECTÉ, lues
// depuis le serveur (source de vérité). Ce n'est PAS la file de vigilance de l'organisation
// (autre écran, autres droits) et ce n'est pas une donnée de démonstration.

export const SUBMISSIONS_CHANGED_EVENT = 'vigicore:submissions-changed';

const SEVERITY = { legere: 'Légère', moderee: 'Modérée', grave: 'Grave' };
const KIND = { INCIDENT: 'Incident', DEVICE_MALFUNCTION: 'Panne de dispositif' };
const IMPACT = {
  none: 'Sans impact (panne technique)',
  delay: 'Retard de prise en charge',
  exposed: 'Patient / utilisateur exposé à un risque',
  injury: 'Blessure d’un patient / utilisateur',
};
const CONTEXT = { utilisation: 'Pendant l’utilisation', demarrage: 'À la mise en marche', nettoyage: 'Nettoyage / désinfection', maintenance: 'Pendant la maintenance', transport: 'Transport / stockage' };
const STATE = { en_service: 'En service', hors_service: 'Hors service', quarantaine: 'Mis en quarantaine' };
const SYMPTOM = { arret: 'Arrêt complet', alarme: 'Alarme / code erreur', mesure: 'Mesure erronée', chauffe: 'Fuite / surchauffe', bruit: 'Bruit ou vibration anormale', dommage: 'Dommage physique' };
const ACTION = { hors_service: 'Mis hors service', remplace: 'Remplacé par un autre appareil', maintenance: 'Maintenance contactée', aucune: 'Aucune action' };
export const FIELD_LABEL = {
  recordKind: null, informManufacturer: null, sharedWithDoctors: null, description: 'Description', service: 'Service / localisation', productType: 'Type de produit', productName: 'Produit',
  lotNumber: 'Lot', expiryDate: 'Péremption', onsetDate: 'Date de survenue', duration: 'Durée', severity: 'Gravité', symptoms: 'Symptômes',
  symptomDesc: 'Description des symptômes', dechallenge: 'Arrêt du médicament', rechallenge: 'Disparition après arrêt',
  'device.name': 'Dispositif', 'device.brand': 'Marque', 'device.model': 'Modèle', 'device.serialNumber': 'N° de série',
  'device.inventoryNumber': 'N° d’inventaire', 'device.udi': 'UDI', 'device.lastMaintenanceDate': 'Dernière maintenance',
  'malfunction.occurredOn': 'Survenue le', 'malfunction.occurredAt': 'À', 'malfunction.context': 'Circonstances', 'malfunction.symptoms': 'Symptômes',
  'malfunction.errorCode': 'Code erreur', 'malfunction.actionTaken': 'Action immédiate', 'malfunction.maintenanceTicket': 'Ticket de maintenance',
  'malfunction.deviceState': 'État de l’appareil', 'malfunction.impact': 'Impact',
  'malfunction.precursors': 'Signes avant la panne', clinical: 'Éléments cliniques', attachmentNamesNotTransmitted: 'Pièces jointes mentionnées (NON transmises)',
};
const VALUE_MAP = { 'malfunction.context': CONTEXT, 'malfunction.deviceState': STATE, 'malfunction.impact': IMPACT, 'malfunction.actionTaken': ACTION };
export function fieldValue(key, v) {
  if (key === 'malfunction.precursors') return precursorsText(v);
  if (key === 'clinical') return clinicalText(v);
  if (Array.isArray(v)) return v.map((x) => (key === 'malfunction.symptoms' ? SYMPTOM[x] || x : x)).join(', ');
  return (VALUE_MAP[key] && VALUE_MAP[key][v]) || (key === 'severity' ? SEVERITY[v] || v : String(v));
}
const TONE_CLASS = { green: 'badge badge--green', amber: 'badge badge--amber', blue: 'badge badge--blue', red: 'badge badge--red', gray: 'badge' };

const fmt = (iso) => { try { return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };
const shortRef = (id) => `#${String(id).slice(-6).toUpperCase()}`;

function Row({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return <div className="u-fs-12" style={{ marginBottom: 4 }}><strong>{label} : </strong>{value}</div>;
}

function Messages({ submission, userId }) {
  const toast = useToast();
  const [msgs, setMsgs] = useState(null); // null = chargement ; 'ERR' = indisponible
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(newIdempotencyKey());
  const lastSeen = useRef(readSeen(typeof localStorage !== 'undefined' ? localStorage : null, userId, submission.id));
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const r = await getMessages(submission.id);
    if (r === null) { setMsgs((m) => (Array.isArray(m) ? m : 'ERR')); return; }
    setMsgs((prev) => mergeMessages(Array.isArray(prev) ? prev : [], r));
    setUnread(unreadCount(r, lastSeen.current));
    const latest = latestSentAt(r);
    if (latest) writeSeen(typeof localStorage !== 'undefined' ? localStorage : null, userId, submission.id, latest);
  }, [submission.id, userId]);
  useEffect(() => { load(); }, [load]);

  async function send() {
    const v = validateMessage(text);
    if (!v.ok) { toast('warn', 'Message', v.reason === 'EMPTY' ? 'Écrivez un message.' : `Message trop long (${MAX_MESSAGE} caractères max).`, 'ti ti-alert-triangle'); return; }
    setBusy(true);
    const r = await sendMessage(submission.id, v.content, keyRef.current);
    setBusy(false);
    if (r.ok) { setText(''); keyRef.current = newIdempotencyKey(); await load(); return; }
    // La clé est conservée : un nouvel essai avec le MÊME texte ne peut pas créer de doublon.
    const why = r.httpStatus === 409 ? 'La vigilance n’accepte plus de messages sur cette déclaration.' : 'Message non envoyé : le service de vigilance est indisponible. Réessayez.';
    toast('error', 'Message non envoyé', why, 'ti ti-alert-triangle');
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div className="u-fs-12" style={{ fontWeight: 600, marginBottom: 6 }}>
        Échanges avec la vigilance{unread > 0 && <span className="badge badge--amber" style={{ marginLeft: 8 }}>{unread} nouveau{unread > 1 ? 'x' : ''}</span>}
      </div>
      {msgs === null && <div className="u-fs-12">Chargement des messages…</div>}
      {msgs === 'ERR' && <div className="u-fs-12" role="alert">Messages momentanément indisponibles. <button className="tbl-action-btn" onClick={load}>Réessayer</button></div>}
      {Array.isArray(msgs) && msgs.length === 0 && <div className="u-fs-12">Aucun message pour le moment.</div>}
      {Array.isArray(msgs) && msgs.map((m) => (
        <div key={m.id} className="u-fs-12" style={{ margin: '6px 0', textAlign: m.direction === 'FROM_REPORTER' ? 'right' : 'left' }}>
          <div className="table-sub">{m.direction === 'FROM_REPORTER' ? 'Vous' : 'Vigilance'} · {fmt(m.sentAt)}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
        </div>
      ))}
      <textarea className="input" rows={3} style={{ width: '100%', marginTop: 8 }} maxLength={MAX_MESSAGE} value={text}
        onChange={(e) => setText(e.target.value)} placeholder="Votre message à la vigilance…" aria-label="Message à la vigilance" />
      <button className="btn btn--primary" style={{ marginTop: 6 }} disabled={busy || !text.trim()} onClick={send}>
        <Icon name="send" />{busy ? 'Envoi…' : 'Envoyer'}
      </button>
    </div>
  );
}

export function RecordFields({ record }) {
  return (
    <>
      {(record.fields || []).map((f) => (FIELD_LABEL[f.key] === null || FIELD_LABEL[f.key] === undefined && f.key === 'recordKind' ? null : (
        <Row key={f.key} label={FIELD_LABEL[f.key] || f.key} value={fieldValue(f.key, f.value)} />
      )))}
    </>
  );
}

function RecordDetail({ id, onChanged }) {
  const toast = useToast();
  const [state, setState] = useState({ loading: true });
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setState({ loading: false, ...(await getRecord(id)) }); }, [id]);
  useEffect(() => { load(); }, [load]);
  async function withdraw() {
    setBusy(true);
    const r = await actOnRecord(id, 'withdraw');
    setBusy(false);
    toast(r.ok ? 'success' : 'error', 'Retrait', r.ok ? 'La déclaration a été retirée.' : (r.httpStatus === 409 ? "Elle n'est plus retirable (déjà prise en charge)." : 'Retrait impossible pour le moment.'), 'ti ti-trash');
    await load(); onChanged();
  }
  if (state.loading) return <div className="u-fs-12" style={{ padding: 12 }}>Chargement du détail…</div>;
  if (!state.ok) return <div className="u-fs-12" style={{ padding: 12 }} role="alert">{state.notFound ? 'Cette déclaration est introuvable (ou ne vous appartient pas).' : 'Détail momentanément indisponible.'} {!state.notFound && <button className="tbl-action-btn" onClick={load}>Réessayer</button>}</div>;
  const r = state.record; const st = presentRecordStatus(r);
  return (
    <div style={{ padding: 12, borderTop: '1px solid var(--border, #e5e5ea)' }}>
      <div style={{ marginBottom: 8 }}><span className={TONE_CLASS[st.tone] || 'badge'}>{st.label}</span></div>
      <div className="u-fs-12" style={{ marginBottom: 8 }} role="note">
        {r.kind === 'PATIENT'
          ? "Cette déclaration est conservée dans votre espace. Elle n'a été transmise ni à une vigilance, ni au CNPM, ni à votre médecin."
          : "Enregistrement durable pour le suivi interne de votre établissement. Aucune vigilance externe n'a été notifiée."}
      </div>
      <Row label="Nature" value={RECORD_KIND_LABEL[r.kind]} />
      <Row label="Enregistrée le" value={fmt(r.createdAt)} /><Row label="Dernière mise à jour" value={fmt(r.updatedAt)} />
      <RecordFields record={r} />
      {canWithdrawRecord(r) && <button className="btn btn--primary" style={{ marginTop: 10 }} disabled={busy} onClick={withdraw}>{busy ? 'Retrait…' : 'Retirer cette déclaration'}</button>}
    </div>
  );
}

function Detail({ id, userId, onChanged }) {
  const toast = useToast();
  const [state, setState] = useState({ loading: true });
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    const r = await getDeclaration(id);
    setState({ loading: false, ...r });
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function retry() {
    setRetrying(true);
    const r = await retryDeclaration(id);
    setRetrying(false);
    const d = describeRetry(r);
    toast(d.tone === 'success' ? 'success' : d.tone === 'warn' ? 'warn' : 'error', 'Renvoi', d.text, 'ti ti-send');
    await load();
    onChanged();
  }

  if (state.loading) return <div className="u-fs-12" style={{ padding: 12 }}>Chargement du détail…</div>;
  if (!state.ok) {
    return (
      <div className="u-fs-12" style={{ padding: 12 }} role="alert">
        {state.notFound ? 'Cette déclaration est introuvable (ou ne vous appartient pas).' : 'Détail momentanément indisponible.'}
        {!state.notFound && <> <button className="tbl-action-btn" onClick={load}>Réessayer</button></>}
      </div>
    );
  }
  const s = state.submission;
  const st = presentStatus(s, state.audit);
  const dev = s.device; const mal = s.malfunction;
  return (
    <div style={{ padding: 12, borderTop: '1px solid var(--border, #e5e5ea)' }}>
      <div style={{ marginBottom: 8 }}><span className={TONE_CLASS[st.tone] || 'badge'}>{st.label}</span></div>

      {s.status === 'PENDING' && (
        <div className="u-fs-12" style={{ marginBottom: 8 }} role="status">
          Cette déclaration est <strong>enregistrée sur le Site mais pas encore confirmée par la vigilance</strong>.{' '}
          {s.retrying ? 'Un renvoi automatique est planifié.' : s.autoRetryExhausted ? 'Le renvoi automatique est épuisé : utilisez « Renvoyer maintenant ».' : ''}
        </div>
      )}
      {s.status === 'FAILED' && (
        <div className="u-fs-12" style={{ marginBottom: 8 }} role="alert">
          {tr("Cette déclaration est enregistrée sur le Site mais n’a PAS été reçue par la vigilance : les envois automatiques ont échoué. Utilisez « Renvoyer maintenant » quand le service est de nouveau disponible.")}
        </div>
      )}
      {s.status === 'AWAITING_PRODUCT' && (
        <div className="u-fs-12" style={{ marginBottom: 8 }} role="status">
          Ce produit n’est pas encore dans le catalogue. Votre déclaration est <strong>conservée sur le Site</strong> ;
          l’équipe VigiCore va le rattacher à la bonne vigilance, puis elle sera transmise automatiquement. Elle n’a pas encore été transmise.
        </div>
      )}
      {s.status === 'NOT_ROUTABLE' && <div className="u-fs-12" style={{ marginBottom: 8 }} role="alert">Aucune vigilance ne peut recevoir cette déclaration pour le moment (produit ou organisation non éligible). Elle n’a été transmise à personne.</div>}
      {s.status === 'REJECTED' && s.staffNote && <div className="u-fs-12" style={{ marginBottom: 8 }} role="alert">L’équipe VigiCore n’a pas pu rattacher ce produit à une vigilance : « {shorten(s.staffNote, 300)} ». Elle n’a été transmise à personne ; contactez directement l’autorité compétente si le cas est grave.</div>}
      {s.status === 'REJECTED' && !s.staffNote && <div className="u-fs-12" style={{ marginBottom: 8 }} role="alert">Cette déclaration a été refusée définitivement ({shorten(s.failureReason, 80) || 'contenu invalide'}). Elle n’a été transmise à personne ; créez-en une nouvelle.</div>}
      {s.status === 'RECEIVED' && state.audit?.receivedByOrganizationName && (
        <div className="u-fs-12" style={{ marginBottom: 8 }}>Reçue par <strong>{state.audit.receivedByOrganizationName}</strong> via VigiCore{s.receivedAt ? `, le ${fmt(s.receivedAt)}` : ''}.</div>
      )}
      {s.status === 'RECEIVED' && state.auditUnavailable && <div className="u-fs-12" style={{ marginBottom: 8 }} role="status">Le suivi détaillé est momentanément indisponible ; la réception, elle, est confirmée.</div>}

      <Row label="Nature" value={KIND[s.kind]} />
      <Row label="Produit" value={s.productLabel || 'Produit du catalogue'} />
      <Row label="Lot" value={s.lotNumber} />
      <Row label="Gravité déclarée" value={SEVERITY[s.declaredSeverity]} />
      <Row label="Enregistrée le" value={fmt(s.createdAt)} />
      {dev && (<>
        <Row label="Dispositif" value={[dev.name, dev.brand, dev.model].filter(Boolean).join(' · ')} />
        <Row label="N° de série" value={dev.serialNumber} /><Row label="N° d’inventaire" value={dev.inventoryNumber} />
        <Row label="UDI" value={dev.udi} /><Row label="Dernière maintenance" value={dev.lastMaintenanceDate} />
      </>)}
      {mal && (<>
        <Row label="Impact" value={IMPACT[mal.impact]} />
        <Row label="Survenue le" value={`${mal.occurredOn}${mal.occurredAt ? ` à ${mal.occurredAt}` : ''}`} />
        <Row label="Circonstances" value={CONTEXT[mal.context]} />
        <Row label="Symptômes" value={(mal.symptoms || []).map((x) => SYMPTOM[x] || x).join(', ')} />
        <Row label="Code erreur" value={mal.errorCode} /><Row label="Action immédiate" value={ACTION[mal.actionTaken]} />
        <Row label="Signes avant la panne" value={precursorsText(mal.precursors)} />
        <Row label="Ticket de maintenance" value={mal.maintenanceTicket} /><Row label="État de l’appareil" value={STATE[mal.deviceState]} />
      </>)}
      <div className="u-fs-12" style={{ margin: '8px 0 4px', fontWeight: 600 }}>Description transmise</div>
      <div className="u-fs-12" style={{ whiteSpace: 'pre-wrap' }}>{s.description}</div>

      {canRetry(s) && (
        <button className="btn btn--primary" style={{ marginTop: 10 }} disabled={retrying} onClick={retry}>
          <Icon name="refresh" />{retrying ? 'Renvoi…' : 'Renvoyer maintenant'}
        </button>
      )}
      {canMessage(s) && <Messages submission={s} userId={userId} />}
      {s.status !== 'RECEIVED' && <div className="u-fs-12" style={{ marginTop: 10 }}>La messagerie avec la vigilance est disponible une fois la déclaration reçue.</div>}
    </div>
  );
}

export default function MySubmissions() {
  const { user } = useAuth();
  const toast = useToast();
  const [state, setState] = useState({ loading: true, ok: false, submissions: [], records: [], partial: false });
  const [openId, setOpenId] = useState(null);
  const [retryingId, setRetryingId] = useState(null);

  const refresh = useCallback(async () => {
    const [r, rec] = await Promise.all([listMine(), listMyRecords()]);
    // « indisponible » ≠ « vide » : si une seule des deux sources échoue, on l'affiche sans masquer l'autre.
    setState({ loading: false, ok: r.ok || rec.ok, unauthorized: r.unauthorized && rec.unauthorized, submissions: r.submissions, records: rec.records, partial: r.ok !== rec.ok });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const h = () => refresh();
    window.addEventListener(SUBMISSIONS_CHANGED_EVENT, h);
    return () => window.removeEventListener(SUBMISSIONS_CHANGED_EVENT, h);
  }, [refresh]);
  // Tant qu'une soumission attend sa confirmation, on relit le serveur (bornée à la vie de la page).
  const anyPending = state.submissions.some((s) => s.status === 'PENDING' || s.status === 'AWAITING_PRODUCT');
  const rows = [
    ...state.submissions.map((x) => ({ t: 'sub', id: x.id, createdAt: x.createdAt, x })),
    ...state.records.map((x) => ({ t: 'rec', id: x.id, createdAt: x.createdAt, x })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  useEffect(() => {
    if (!anyPending) return undefined;
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, [anyPending, refresh]);

  async function quickRetry(id) {
    setRetryingId(id);
    const r = await retryDeclaration(id);
    setRetryingId(null);
    const d = describeRetry(r);
    toast(d.tone === 'success' ? 'success' : d.tone === 'warn' ? 'warn' : 'error', 'Renvoi', d.text, 'ti ti-send');
    refresh();
  }

  return (
    <section className="card u-p-0" style={{ marginBottom: 16 }} aria-labelledby="my-subs-title">
      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div id="my-subs-title" style={{ fontWeight: 600 }}>Mes envois à la vigilance</div>
          <div className="u-fs-12">Vos déclarations (envois à la vigilance et enregistrements internes), lues depuis le serveur. Vue personnelle : ce n’est pas la file de votre établissement.</div>
        </div>
        <button className="tbl-action-btn" onClick={refresh} aria-label="Actualiser"><Icon name="refresh" /> Actualiser</button>
      </div>

      {state.loading && <div className="u-fs-12" style={{ padding: 16 }}>Chargement…</div>}
      {!state.loading && !state.ok && (
        <div className="u-fs-12" style={{ padding: 16 }} role="alert">
          {state.unauthorized ? 'Session expirée : reconnectez-vous pour voir vos envois.' : 'Vos envois sont momentanément indisponibles (serveur injoignable). Rien n’est perdu.'}{' '}
          <button className="tbl-action-btn" onClick={refresh}>Réessayer</button>
        </div>
      )}
      {!state.loading && state.ok && state.partial && <div className="u-fs-12" style={{ padding: '0 16px 8px' }} role="alert">Une partie de vos envois est momentanément indisponible : la liste peut être incomplète. <button className="tbl-action-btn" onClick={refresh}>Réessayer</button></div>}
      {!state.loading && state.ok && rows.length === 0 && (
        <div className="inbox-empty"><Icon name="clipboard-off" />Vous n’avez encore enregistré aucune déclaration.</div>
      )}
      {state.ok && rows.length > 0 && (
        <div className="u-overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>RÉFÉRENCE</th><th>NATURE / PRODUIT</th><th>GRAVITÉ</th><th>STATUT</th><th>ACTIONS</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const s = row.x;
                const isRec = row.t === 'rec';
                const st = isRec ? presentRecordStatus(s) : presentStatus(s, null);
                return (
                  <tr key={s.id}>
                    <td colSpan={openId === s.id ? 5 : 1} style={openId === s.id ? { padding: 0 } : undefined}>
                      {openId === s.id ? (
                        <div>
                          <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div><div className="table-ref">{shortRef(s.id)}</div><div className="table-sub">{fmt(s.createdAt)}</div></div>
                            <button className="tbl-action-btn" onClick={() => setOpenId(null)}>Fermer</button>
                          </div>
                          {isRec ? <RecordDetail id={s.id} onChanged={refresh} /> : <Detail id={s.id} userId={user?.id} onChanged={refresh} />}
                        </div>
                      ) : (<><div className="table-ref">{shortRef(s.id)}</div><div className="table-sub">{fmt(s.createdAt)}</div></>)}
                    </td>
                    {openId !== s.id && (<>
                      <td><span className="chip">{isRec ? RECORD_KIND_LABEL[s.kind] : KIND[s.kind]}</span><div className="table-sub">{isRec ? recordTitle(s) : (s.productLabel || shorten(s.description, 50))}</div></td>
                      <td>{isRec ? (SEVERITY[recordField(s, 'severity')] || '—') : (SEVERITY[s.declaredSeverity] || '—')}</td>
                      <td><span className={TONE_CLASS[st.tone] || 'badge'}>{st.label}</span></td>
                      <td>
                        <button className="tbl-action-btn" onClick={() => setOpenId(s.id)}>Voir le détail</button>
                        {!isRec && canRetry(s) && <button className="tbl-action-btn tbl-action-btn--primary" disabled={retryingId === s.id} onClick={() => quickRetry(s.id)}>{retryingId === s.id ? 'Renvoi…' : 'Renvoyer'}</button>}
                      </td>
                    </>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
