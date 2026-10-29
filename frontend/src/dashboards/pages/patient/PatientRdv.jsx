import { useState } from 'react';
import Icon from '../../components/Icon';
import { usePersonalList, todayIso } from '../../lib/usePersonal';
import { useToast } from '../../context/ToastContext';
import { tr, localeTag } from '../../../i18n/translate.js';

// Patient appointments — the patient's own agenda, stored in the account (/api/personal/appointment).
// This is a personal reminder: the practitioner is NOT notified (no booking system is connected),
// and the page says so.

const MOTIFS = ['Consultation de suivi', 'Renouvellement ordonnance', 'Bilan biologique', 'Effet indésirable à discuter', 'Autre'];
const EMPTY_FORM = { practitioner: '', reason: MOTIFS[0], date: '', time: '', notes: '' };

const sortKey = (a) => `${a.date}T${a.time || '00:00'}`;

export default function PatientRdv() {
  const toast = useToast();
  const { items, loading, error, add, update, remove } = usePersonalList('appointment');
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState('upcoming');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const today = todayIso();
  const all = items || [];
  const upcoming = all
    .filter((a) => a.date >= today && a.status !== 'done' && a.status !== 'cancelled')
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const past = all
    .filter((a) => !upcoming.includes(a))
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

  // Most frequent practitioner across the agenda ("praticien habituel")
  const usual = (() => {
    const counts = {};
    for (const a of all) if (a.status !== 'cancelled') counts[a.practitioner] = (counts[a.practitioner] || 0) + 1;
    const top = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
    return top && top[1] > 1 ? top[0] : null;
  })();

  const day = (a) => new Date(`${a.date}T00:00:00`);
  const dayNum = (a) => String(day(a).getDate()).padStart(2, '0');
  const monthShort = (a) => day(a).toLocaleDateString(localeTag(), { month: 'short' });

  const updateForm = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.date) {
      toast('warn', tr("Informations manquantes"), tr("Merci de choisir une date."), 'alert-circle');
      return;
    }
    if (form.date < today) {
      toast('warn', tr("Date passée"), tr("Choisissez une date à venir."), 'alert-circle');
      return;
    }
    const data = { ...form, status: 'planned' };
    if (!data.time) delete data.time;
    setSaving(true);
    const r = await add(data);
    setSaving(false);
    if (!r.ok) return toast('error', tr("Enregistrement impossible"), r.error, 'alert-triangle');
    setShowForm(false);
    setForm(EMPTY_FORM);
    toast('success', tr("Rendez-vous noté"), tr("Ce rendez-vous ({0}) est enregistré dans votre agenda. Le praticien n'est pas notifié : contactez-le directement pour confirmer.", [data.reason]), 'calendar');
  };

  const setStatus = async (a, status) => {
    const r = await update(a.id, { status });
    if (!r.ok) toast('error', tr("Modification impossible"), r.error, 'alert-triangle');
  };

  const removeAppt = async (a) => {
    if (!window.confirm(tr("Supprimer ce rendez-vous ?"))) return;
    const r = await remove(a.id);
    if (!r.ok) toast('error', tr("Suppression impossible"), r.error, 'alert-triangle');
  };

  const next = upcoming[0];

  const row = (a, isPast) => (
    <div className="appt-card" key={a.id}>
      {!isPast && <div className="appt-card-accent u-t95"></div>}
      <div className="appt-date-box"><div className={`appt-day${isPast ? '' : ' u-c-cyan'}`}>{dayNum(a)}</div><div className="appt-month">{monthShort(a)}</div></div>
      <div className="appt-body">
        <div className="appt-title">{tr(a.reason)}</div>
        <div className="appt-doctor">{a.practitioner}</div>
        <div className="appt-time"><Icon name="clock" className="u-fs-11" />{a.time || tr("Heure non précisée")}{a.notes ? ` · ${a.notes}` : ''}</div>
      </div>
      {isPast ? (
        <span className={`badge ${a.status === 'cancelled' ? 'badge--red' : 'badge--green'}`}>{a.status === 'cancelled' ? tr("Annulé") : tr("Terminé")}</span>
      ) : (
        <div className="u-row-gap6">
          <span className="badge badge--amber">{tr("À confirmer")}</span>
          <button className="icon-btn" title={tr("Marquer comme effectué")} aria-label={tr("Marquer comme effectué")} onClick={() => setStatus(a, 'done')}><Icon name="check" /></button>
          <button className="icon-btn" title={tr("Annuler le rendez-vous")} aria-label={tr("Annuler le rendez-vous")} onClick={() => setStatus(a, 'cancelled')}><Icon name="calendar-x" /></button>
        </div>
      )}
      <button className="icon-btn" title={tr("Supprimer")} aria-label={tr("Supprimer ce rendez-vous")} onClick={() => removeAppt(a)}><Icon name="trash" /></button>
    </div>
  );

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Mes")} <span className="page-title-accent">{tr("rendez-vous")}</span></h1></div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={() => setShowForm((v) => !v)}>
            <Icon name="calendar-plus" />{showForm ? tr("Annuler") : tr("Ajouter un RDV")}
          </button>
        </div>
      </div>

      {error && <div className="alert-banner alert-banner--amber"><Icon name="alert-triangle" /><div className="alert-banner-text">{error}</div></div>}

      <div className="grid-kpi">
        <div className="kpi-card">
          <div className="kpi-accent u-t94"></div>
          <div className="kpi-header"><div className="kpi-label">{tr("Prochain RDV")}</div><div className="kpi-icon u-bg-purple-dim"><Icon name="calendar" /></div></div>
          <div className="kpi-value" style={{ fontSize: '20px' }}>{loading ? '…' : next ? `${dayNum(next)} ${monthShort(next)}` : '—'}</div>
          <div className="kpi-sub">{next ? next.practitioner : tr("Aucun RDV planifié")}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-accent u-t54"></div>
          <div className="kpi-header"><div className="kpi-label">{tr("RDV à venir")}</div><div className="kpi-icon u-t10"><Icon name="calendar-stats" /></div></div>
          <div className="kpi-value">{loading ? '…' : upcoming.length}</div>
          <div className="kpi-sub">{tr("Consultations et examens")}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-accent u-t12"></div>
          <div className="kpi-header"><div className="kpi-label">{tr("Praticien habituel")}</div><div className="kpi-icon u-t15"><Icon name="user-check" /></div></div>
          <div className="kpi-value" style={{ fontSize: '16px' }}>{usual || '—'}</div>
          <div className="kpi-sub">{usual ? tr("D'après votre agenda") : tr("Non déterminé")}</div>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <div className="section-header">
            <h2 className="section-title"><Icon name="calendar-plus" className="u-c-purple" />{tr("Nouveau rendez-vous")}</h2>
          </div>
          <div className="u-fs-12 u-t102" style={{ marginBottom: '10px' }}>{tr("Agenda personnel : le praticien n'est pas prévenu automatiquement.")}</div>
          <form onSubmit={submit}>
            <div className="form-row-2" style={{ marginBottom: '12px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="rdvPraticien">{tr("Praticien / établissement")}</label>
                <input id="rdvPraticien" className="form-input" maxLength={160} placeholder={tr("Nom du praticien ou de l'établissement")} value={form.practitioner} onChange={updateForm('practitioner')} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="rdvMotif">{tr("Motif")}</label>
                <select id="rdvMotif" className="form-input" value={form.reason} onChange={updateForm('reason')}>
                  {MOTIFS.map((m) => <option key={m} value={m}>{tr(m)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="rdvDate">{tr("Date")}</label>
                <input id="rdvDate" type="date" min={today} className="form-input" value={form.date} onChange={updateForm('date')} required />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="rdvHeure">{tr("Heure")}</label>
                <input id="rdvHeure" type="time" className="form-input" value={form.time} onChange={updateForm('time')} />
              </div>
              <div className="form-group u-t127">
                <label className="form-label" htmlFor="rdvNotes">{tr("Note")}</label>
                <input id="rdvNotes" className="form-input" maxLength={500} placeholder={tr("Ex : apporter les résultats d'analyses")} value={form.notes} onChange={updateForm('notes')} />
              </div>
            </div>
            <button type="submit" className="btn btn--primary" disabled={saving}><Icon name="device-floppy" />{saving ? tr("Enregistrement…") : tr("Enregistrer")}</button>
          </form>
        </div>
      )}

      <div className="filter-tabs" role="tablist" aria-label={tr("RDV à venir ou passés")}>
        <button className={`filter-tab${tab === 'upcoming' ? ' is-active' : ''}`} role="tab" aria-selected={tab === 'upcoming'} onClick={() => setTab('upcoming')}>{tr("À venir ({0})", [upcoming.length])}</button>
        <button className={`filter-tab${tab === 'past' ? ' is-active' : ''}`} role="tab" aria-selected={tab === 'past'} onClick={() => setTab('past')}>{tr("Passés ({0})", [past.length])}</button>
      </div>

      <div className="card">
        <div className="u-col-gap8">
          {loading && <div className="u-fs-12 u-t102">{tr("Chargement…")}</div>}
          {tab === 'upcoming' && upcoming.map((a) => row(a, false))}
          {tab === 'past' && past.map((a) => row(a, true))}
          {!loading && tab === 'past' && past.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '12px' }}>{tr("Aucun rendez-vous passé.")}</div>
          )}
          {!loading && tab === 'upcoming' && upcoming.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '12px' }}>{tr("Aucun rendez-vous à venir.")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
