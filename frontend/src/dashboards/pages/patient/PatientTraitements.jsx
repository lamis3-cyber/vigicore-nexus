import { useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import { usePersonalList, todayIso } from '../../lib/usePersonal';
import { adherence, isActiveTreatment as isActive, localDay } from '../../lib/treatments';
import { useToast } from '../../context/ToastContext';
import { tr, localeTag } from '../../../i18n/translate.js';

// Patient treatments — stored in the patient's account:
//   /api/personal/treatment  (name, dosage, doses per day, dates, prescriber)
//   /api/personal/intake     (one row per dose the patient marks as taken)
// Adherence is computed only when the patient gave a number of doses per day; otherwise it shows "—".

const EMPTY_FORM = { name: '', dosage: '', dosesPerDay: '1', instructions: '', prescriber: '', startDate: '', endDate: '' };
export default function PatientTraitements() {
  const toast = useToast();
  const treatments = usePersonalList('treatment');
  const intakes = usePersonalList('intake');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const today = todayIso();
  const meds = treatments.items || [];
  const doses = intakes.items || [];
  const active = meds.filter((t) => isActive(t, today));
  const loading = treatments.loading || intakes.loading;

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const dosesThisMonth = doses.filter((d) => new Date(d.takenAt) >= monthStart).length;
  const rate = useMemo(() => adherence(meds, doses), [meds, doses]);
  const takenToday = (t) => doses.filter((d) => d.treatmentId === t.id && localDay(d.takenAt) === today).length;
  const nameOf = (id) => meds.find((t) => t.id === id)?.name || tr("Traitement supprimé");

  const updateForm = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      toast('warn', tr("Dates incohérentes"), tr("La date de fin précède la date de début."), 'alert-circle');
      return;
    }
    const data = { ...form, dosesPerDay: Number(form.dosesPerDay) || undefined };
    for (const k of ['startDate', 'endDate']) if (!data[k]) delete data[k];
    setSaving(true);
    const r = await treatments.add(data);
    setSaving(false);
    if (!r.ok) return toast('error', tr("Enregistrement impossible"), r.error, 'alert-triangle');
    setForm(EMPTY_FORM);
    setShowForm(false);
    toast('success', tr("Traitement ajouté"), data.name, 'pill');
  };

  const markTaken = async (t) => {
    const r = await intakes.add({ treatmentId: t.id, takenAt: new Date().toISOString() });
    if (!r.ok) return toast('error', tr("Enregistrement impossible"), r.error, 'alert-triangle');
    toast('success', tr("Prise enregistrée"), tr("{0} — {1}", [t.name, new Date().toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })]), 'check');
  };

  const undoIntake = async (d) => {
    const r = await intakes.remove(d.id);
    if (!r.ok) toast('error', tr("Suppression impossible"), r.error, 'alert-triangle');
  };

  const stopTreatment = async (t) => {
    const r = await treatments.update(t.id, { endDate: today });
    if (!r.ok) toast('error', tr("Modification impossible"), r.error, 'alert-triangle');
  };

  const removeTreatment = async (t) => {
    if (!window.confirm(tr("Supprimer « {0} » et l'historique de ses prises ?", [t.name]))) return;
    const r = await treatments.remove(t.id);
    if (!r.ok) return toast('error', tr("Suppression impossible"), r.error, 'alert-triangle');
    intakes.reload();
  };

  const fmtDate = (iso) => new Date(iso).toLocaleString(localeTag(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtDay = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(localeTag()) : '');

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Mes")} <span className="page-title-accent">{tr("Traitements")}</span></h1></div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={() => setShowForm((v) => !v)}>
            <Icon name={showForm ? 'x' : 'plus'} />{showForm ? tr("Annuler") : tr("Ajouter médicament")}
          </button>
        </div>
      </div>

      {(treatments.error || intakes.error) && (
        <div className="alert-banner alert-banner--amber"><Icon name="alert-triangle" /><div className="alert-banner-text">{treatments.error || intakes.error}</div></div>
      )}

      <div className="grid-kpi">
        <div className="kpi-card">
          <div className="kpi-header"><div className="kpi-label">{tr("Observance (7 jours)")}</div><div className="kpi-icon u-bg-green-dim"><Icon name="chart-line" /></div></div>
          <div className="kpi-value">{loading ? '…' : rate === null ? '—' : `${rate} %`}</div>
          <div className="kpi-sub">{rate === null ? tr("Indiquez le nombre de prises par jour") : tr("Prises enregistrées / prévues")}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header"><div className="kpi-label">{tr("Traitements actifs")}</div><div className="kpi-icon u-t10"><Icon name="pill" /></div></div>
          <div className="kpi-value">{loading ? '…' : active.length}</div>
          <div className="kpi-sub">{meds.length ? tr("{0} au total", [meds.length]) : tr("Aucun traitement")}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-header"><div className="kpi-label">{tr("Doses prises ce mois")}</div><div className="kpi-icon u-bg-green-dim"><Icon name="check" /></div></div>
          <div className="kpi-value">{loading ? '…' : dosesThisMonth}</div>
          <div className="kpi-sub">{dosesThisMonth ? tr("Depuis le 1er du mois") : tr("Aucune dose enregistrée")}</div>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <div className="section-header"><h2 className="section-title"><Icon name="pill" className="u-c-cyan" />{tr("Nouveau traitement")}</h2></div>
          <form onSubmit={submit}>
            <div className="form-row-2" style={{ marginBottom: '12px' }}>
              <div className="form-group"><label className="form-label" htmlFor="trName">{tr("Médicament")}</label><input id="trName" className="form-input" maxLength={160} value={form.name} onChange={updateForm('name')} required /></div>
              <div className="form-group"><label className="form-label" htmlFor="trDosage">{tr("Dosage")}</label><input id="trDosage" className="form-input" maxLength={80} placeholder={tr("Ex : 500 mg")} value={form.dosage} onChange={updateForm('dosage')} /></div>
              <div className="form-group">
                <label className="form-label" htmlFor="trPerDay">{tr("Prises par jour")}</label>
                <select id="trPerDay" className="form-input" value={form.dosesPerDay} onChange={updateForm('dosesPerDay')}>
                  <option value="">{tr("À la demande")}</option>
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label" htmlFor="trPrescriber">{tr("Prescripteur")}</label><input id="trPrescriber" className="form-input" maxLength={160} value={form.prescriber} onChange={updateForm('prescriber')} /></div>
              <div className="form-group"><label className="form-label" htmlFor="trStart">{tr("Début")}</label><input id="trStart" type="date" className="form-input" value={form.startDate} onChange={updateForm('startDate')} /></div>
              <div className="form-group"><label className="form-label" htmlFor="trEnd">{tr("Fin (si connue)")}</label><input id="trEnd" type="date" className="form-input" value={form.endDate} onChange={updateForm('endDate')} /></div>
              <div className="form-group u-t127"><label className="form-label" htmlFor="trInstr">{tr("Consignes")}</label><input id="trInstr" className="form-input" maxLength={500} placeholder={tr("Ex : pendant le repas")} value={form.instructions} onChange={updateForm('instructions')} /></div>
            </div>
            <button type="submit" className="btn btn--primary" disabled={saving}><Icon name="device-floppy" />{saving ? tr("Enregistrement…") : tr("Enregistrer")}</button>
          </form>
        </div>
      )}

      <div className="card" id="anchor-traitements-meds">
        <div className="section-header"><h2 className="section-title"><Icon name="pill" className="u-c-cyan" />{tr("Mes médicaments")}</h2></div>
        {loading && <div className="u-fs-12 u-t102">{tr("Chargement…")}</div>}
        {!loading && meds.length === 0 && <div className="u-fs-12 u-t102" style={{ padding: '8px 0' }}>{tr("Aucun traitement enregistré. Ajoutez un médicament pour suivre vos prises.")}</div>}
        <div className="u-col-gap8">
          {meds.map((t) => {
            const on = isActive(t, today);
            const done = takenToday(t);
            return (
              <div className="med-card" key={t.id}>
                <div className="med-card-header">
                  <div className="med-icon u-t10"><Icon name="pill" /></div>
                  <div>
                    <div className="med-name">{t.name}{t.dosage ? ` · ${t.dosage}` : ''}</div>
                    <div className="med-dosage">
                      {[t.dosesPerDay ? tr("{0} prise(s) / jour", [t.dosesPerDay]) : tr("À la demande"), t.instructions, t.prescriber].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <span className={`badge ${on ? 'badge--green' : 'badge--blue'} u-ml-auto`}>{on ? tr("Actif") : tr("Terminé")}</span>
                </div>
                <div className="u-fs-12 u-t102" style={{ marginBottom: '8px' }}>
                  {t.startDate ? tr("Depuis le {0}", [fmtDay(t.startDate)]) : ''}{t.endDate ? ` — ${tr("jusqu'au {0}", [fmtDay(t.endDate)])}` : ''}
                  {on && t.dosesPerDay ? ` · ${tr("Aujourd'hui : {0}/{1}", [done, t.dosesPerDay])}` : ''}
                </div>
                <div className="u-row-gap6">
                  {on && <button className="btn btn--primary u-flex-1" onClick={() => markTaken(t)}><Icon name="check" />{tr("J'ai pris ma dose")}</button>}
                  {on && <button className="btn" onClick={() => stopTreatment(t)}><Icon name="player-stop" />{tr("Arrêter")}</button>}
                  <button className="icon-btn" title={tr("Supprimer")} aria-label={tr("Supprimer ce traitement")} onClick={() => removeTreatment(t)}><Icon name="trash" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" id="anchor-traitements-historique">
        <div className="section-header">
          <h2 className="section-title"><Icon name="history" className="u-c-purple" />{tr("Historique des prises")}</h2>
        </div>
        {!loading && doses.length === 0 && <div className="u-fs-12 u-t102" style={{ padding: '8px 0' }}>{tr("Aucune prise enregistrée.")}</div>}
        {[...doses].sort((a, b) => b.takenAt.localeCompare(a.takenAt)).slice(0, 30).map((d) => (
          <div key={d.id} className="u-fs-12" style={{ padding: '6px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border-subtle)' }}>
            <span><Icon name="check" className="u-c-green" /> {nameOf(d.treatmentId)}</span>
            <span className="u-t102">{fmtDate(d.takenAt)}</span>
            <button className="icon-btn" title={tr("Annuler cette prise")} aria-label={tr("Annuler cette prise")} onClick={() => undoIntake(d)}><Icon name="arrow-back-up" /></button>
          </div>
        ))}
      </div>
      <div id="anchor-traitements-posologie" />
    </div>
  );
}
