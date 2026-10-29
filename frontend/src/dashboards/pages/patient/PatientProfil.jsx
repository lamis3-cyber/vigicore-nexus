import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePersonalList, usePersonalSingleton } from '../../lib/usePersonal';
import { tr } from '../../../i18n/translate.js';

// Patient health profile — stored in the patient's account:
//   /api/personal/singleton/health_profile   identity, contact details, privacy choices
//   /api/personal/allergy | condition | emergency_contact   the three lists
// The name and e-mail of the ACCOUNT are not changed here (Settings page does that).

const EMPTY_INFO = {
  prenom: '', nom: '', birthdate: '', sexe: '', poids: '', taille: '',
  telephone: '', adresse: '', pharmacie: '', cnas: '',
};

const DEFAULT_SWITCHES = {
  shareDoctor: false,
  alertesCNPM: true,
  rappelsPrise: true,
  analyseIA: false,
  sharePharmacie: false,
};

const SWITCHES = [
  { key: 'shareDoctor', title: 'Partage données avec mon médecin traitant', text: 'Votre médecin traitant peut accéder à votre dossier VigiCore' },
  { key: 'alertesCNPM', title: 'Alertes pharmacovigilance CNPM', text: 'Recevoir les rappels officiels qui vous concernent' },
  { key: 'rappelsPrise', title: 'Rappels de prise médicamenteuse', text: 'Notifications pour chaque dose planifiée' },
  { key: 'analyseIA', title: 'Analyse IA de mes données cliniques', text: 'Recommandations personnalisées VigiCore AI · anonymisé' },
  { key: 'sharePharmacie', title: 'Partage pharmacie habituelle', text: 'Permettre à votre pharmacien de voir vos rappels actifs' },
];

const SEVERITY = {
  legere: { label: 'Légère', badge: 'badge--blue' },
  moderee: { label: 'Modérée', badge: 'badge--amber' },
  severe: { label: 'Sévère', badge: 'badge--red' },
};

const initialsOf = (name) => (name || '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

/** Small inline "add" form used by the three lists. */
function InlineAdd({ fields, onSubmit, submitLabel, onCancel }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, f.default ?? ''])));
  const [busy, setBusy] = useState(false);
  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const data = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''));
    const ok = await onSubmit(data);
    setBusy(false);
    if (ok) setValues(Object.fromEntries(fields.map((f) => [f.name, f.default ?? ''])));
  };
  return (
    <form onSubmit={submit} className="u-col-gap8" style={{ marginBottom: '12px' }}>
      {fields.map((f) => (
        <div className="form-group" key={f.name}>
          <label className="form-label" htmlFor={`add-${f.name}`}>{tr(f.label)}</label>
          {f.options ? (
            <select id={`add-${f.name}`} className="form-input" value={values[f.name]} onChange={set(f.name)}>
              {f.options.map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
            </select>
          ) : (
            <input id={`add-${f.name}`} type={f.type || 'text'} className="form-input" maxLength={f.max} required={f.required} value={values[f.name]} onChange={set(f.name)} />
          )}
        </div>
      ))}
      <div className="u-row-gap6">
        <button type="submit" className="btn btn--primary u-btn-sm" disabled={busy}><Icon name="check" />{tr(submitLabel)}</button>
        <button type="button" className="btn u-btn-sm" onClick={onCancel}>{tr("Annuler")}</button>
      </div>
    </form>
  );
}

export default function PatientProfil() {
  const { user } = useAuth();
  const toast = useToast();
  const profile = usePersonalSingleton('health_profile');
  const allergies = usePersonalList('allergy');
  const conditions = usePersonalList('condition');
  const contacts = usePersonalList('emergency_contact');

  const [info, setInfo] = useState(EMPTY_INFO);
  const [switches, setSwitches] = useState(DEFAULT_SWITCHES);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(null); // 'allergy' | 'condition' | 'contact' | null

  // Fill the form once the saved profile is loaded (account name as a starting point).
  useEffect(() => {
    if (!profile.loaded) return;
    const d = profile.data || {};
    const [first = '', ...rest] = (user?.name || '').split(' ');
    setInfo({
      ...EMPTY_INFO,
      prenom: d.prenom ?? first,
      nom: d.nom ?? rest.join(' '),
      ...Object.fromEntries(Object.keys(EMPTY_INFO).filter((k) => d[k] !== undefined).map((k) => [k, d[k]])),
    });
    setSwitches({ ...DEFAULT_SWITCHES, ...Object.fromEntries(Object.keys(DEFAULT_SWITCHES).filter((k) => typeof d[k] === 'boolean').map((k) => [k, d[k]])) });
  }, [profile.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateInfo = (field) => (e) => { setInfo((d) => ({ ...d, [field]: e.target.value })); setDirty(true); };
  const toggleSwitch = (field) => () => { setSwitches((s) => ({ ...s, [field]: !s[field] })); setDirty(true); };

  async function save() {
    setSaving(true);
    const data = { ...switches };
    for (const [k, v] of Object.entries(info)) if (v !== '') data[k] = v;
    const r = await profile.save(data);
    setSaving(false);
    if (!r.ok) return toast('error', tr("Enregistrement impossible"), r.error, 'alert-triangle');
    setDirty(false);
    toast('success', tr("Sauvegardé"), tr("Profil mis à jour"), 'circle-check');
  }

  const addTo = (list, label) => async (data) => {
    const r = await list.add(data);
    if (!r.ok) {
      toast('error', tr("Enregistrement impossible"), r.error, 'alert-triangle');
      return false;
    }
    toast('success', tr(label), tr("Élément ajouté"), 'plus');
    setAdding(null);
    return true;
  };

  const removeFrom = (list) => async (item) => {
    if (!window.confirm(tr("Supprimer « {0} » ?", [item.name]))) return;
    const r = await list.remove(item.id);
    if (!r.ok) toast('error', tr("Suppression impossible"), r.error, 'alert-triangle');
  };

  const listState = (list, emptyText) => {
    if (list.loading) return <div className="u-fs-12 u-t102">{tr("Chargement…")}</div>;
    if (list.error) return <div className="u-fs-12 u-c-red">{list.error}</div>;
    if (list.items.length === 0) return <div className="u-fs-12 u-t102">{tr(emptyText)}</div>;
    return null;
  };

  const displayName = [info.prenom, info.nom].filter(Boolean).join(' ') || user?.name || '';

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Mon")} <span className="page-title-accent">{tr("Profil")}</span> {tr("santé")}</h1></div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={save} disabled={saving || !profile.loaded}>
            <Icon name="device-floppy" />{saving ? tr("Enregistrement…") : dirty ? tr("Sauvegarder les modifications") : tr("Sauvegarder")}
          </button>
        </div>
      </div>

      {profile.error && <div className="alert-banner alert-banner--amber"><Icon name="alert-triangle" /><div className="alert-banner-text">{profile.error}</div></div>}

      <div className="card">
        <div className="u-t5">
          <div
            style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 700, color: '#fff', boxShadow: '0 0 20px rgba(167,139,250,.3)', flexShrink: 0 }}
          >
            {initialsOf(displayName)}
          </div>
          <div className="u-flex-1">
            <div className="u-t6">{displayName}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {tr("N° CNAS :")} <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{info.cnas || tr("non renseigné")}</span>
              {user?.email ? ` · ${user.email}` : ''}
            </div>
            <div className="u-t42"></div>
          </div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="profPrenom">{tr("Prénom")}</label><input id="profPrenom" className="form-input" maxLength={80} value={info.prenom} onChange={updateInfo('prenom')} /></div>
          <div className="form-group"><label className="form-label" htmlFor="profNom">{tr("Nom de famille")}</label><input id="profNom" className="form-input" maxLength={80} value={info.nom} onChange={updateInfo('nom')} /></div>
          <div className="form-group"><label className="form-label" htmlFor="profBirth">{tr("Date de naissance")}</label><input id="profBirth" type="date" className="form-input" value={info.birthdate} onChange={updateInfo('birthdate')} /></div>
          <div className="form-group">
            <label className="form-label" htmlFor="profSexe">{tr("Sexe biologique")}</label>
            <select id="profSexe" className="form-input" value={info.sexe} onChange={updateInfo('sexe')}>
              <option value="">—</option>
              <option value="F">{tr("Féminin")}</option>
              <option value="M">{tr("Masculin")}</option>
            </select>
          </div>
          <div className="form-group"><label className="form-label" htmlFor="profPoids">{tr("Poids (kg)")}</label><input id="profPoids" inputMode="decimal" className="form-input" maxLength={10} value={info.poids} onChange={updateInfo('poids')} /></div>
          <div className="form-group"><label className="form-label" htmlFor="profTaille">{tr("Taille (cm)")}</label><input id="profTaille" inputMode="decimal" className="form-input" maxLength={10} value={info.taille} onChange={updateInfo('taille')} /></div>
          <div className="form-group"><label className="form-label" htmlFor="profTel">{tr("Téléphone")}</label><input id="profTel" type="tel" className="form-input" maxLength={30} value={info.telephone} onChange={updateInfo('telephone')} /></div>
          <div className="form-group"><label className="form-label" htmlFor="profCnas">{tr("N° CNAS")}</label><input id="profCnas" className="form-input u-mono" maxLength={40} value={info.cnas} onChange={updateInfo('cnas')} /></div>
          <div className="form-group u-t127"><label className="form-label" htmlFor="profAddr">{tr("Adresse complète")}</label><input id="profAddr" className="form-input" maxLength={300} value={info.adresse} onChange={updateInfo('adresse')} /></div>
          <div className="form-group u-t127">
            <label className="form-label" htmlFor="profPharma">{tr("Pharmacie habituelle")} <span className="u-t126">{tr("— utilisée pour les rappels et renouvellements")}</span></label>
            <input id="profPharma" className="form-input" maxLength={160} value={info.pharmacie} onChange={updateInfo('pharmacie')} />
          </div>
        </div>
      </div>

      <div className="grid-2col">
        <div className="card">
          <div className="section-header u-mb-12">
            <h2 className="section-title"><Icon name="alert-circle" className="u-c-red" />{tr("Allergies")}</h2>
            <button className="btn btn--danger u-btn-sm" onClick={() => setAdding(adding === 'allergy' ? null : 'allergy')}><Icon name="plus" />{tr("Ajouter")}</button>
          </div>
          {adding === 'allergy' && (
            <InlineAdd
              submitLabel="Ajouter l'allergie"
              onCancel={() => setAdding(null)}
              onSubmit={addTo(allergies, 'Allergie')}
              fields={[
                { name: 'name', label: 'Allergène', max: 120, required: true },
                { name: 'reaction', label: 'Réaction', max: 300 },
                { name: 'severity', label: 'Sévérité', default: 'moderee', options: Object.entries(SEVERITY).map(([v, s]) => [v, s.label]) },
              ]}
            />
          )}
          <div className="u-col-gap8">
            {listState(allergies, "Aucune allergie enregistrée.")}
            {(allergies.items || []).map((a) => {
              const danger = a.severity === 'severe';
              return (
                <div
                  key={a.id}
                  style={danger
                    ? { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--color-red-dim)', border: '1px solid rgba(244,63,94,.20)', borderRadius: 'var(--radius-md)' }
                    : undefined}
                  className={danger ? undefined : 'u-t103'}
                >
                  <Icon name={danger ? 'alert-triangle' : 'alert-circle'} style={danger ? { color: 'var(--color-red)', fontSize: '16px' } : undefined} className={danger ? '' : 'u-t59'} />
                  <div className="u-flex-1"><div className="u-fs12-5-strong">{a.name}</div><div className="u-fs10-5-tertiary">{a.reaction || '—'}</div></div>
                  <span className={`badge ${SEVERITY[a.severity]?.badge || 'badge--blue'}`}>{tr(SEVERITY[a.severity]?.label || a.severity)}</span>
                  <button className="icon-btn" title={tr("Supprimer")} aria-label={tr("Supprimer")} onClick={() => removeFrom(allergies)(a)}><Icon name="trash" /></button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="section-header u-mb-12">
            <h2 className="section-title"><Icon name="stethoscope" className="u-c-blue" />{tr("Maladies chroniques")}</h2>
            <button className="btn u-btn-sm" onClick={() => setAdding(adding === 'condition' ? null : 'condition')}><Icon name="plus" />{tr("Ajouter")}</button>
          </div>
          {adding === 'condition' && (
            <InlineAdd
              submitLabel="Ajouter"
              onCancel={() => setAdding(null)}
              onSubmit={addTo(conditions, 'Maladie chronique')}
              fields={[
                { name: 'name', label: 'Maladie', max: 160, required: true },
                { name: 'since', label: 'Depuis', type: 'date' },
                { name: 'notes', label: 'Note', max: 500 },
              ]}
            />
          )}
          <div className="u-col-gap8">
            {listState(conditions, "Aucune maladie chronique enregistrée.")}
            {(conditions.items || []).map((m) => (
              <div key={m.id} className="u-t39">
                <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', background: 'var(--color-blue-dim, rgba(59,130,246,.12))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="heart-rate-monitor" className="u-c-blue" />
                </div>
                <div className="u-flex-1">
                  <div className="u-fs12-5-strong">{m.name}</div>
                  <div className="u-fs10-5-tertiary">{[m.since ? tr("Depuis {0}", [new Date(`${m.since}T00:00:00`).getFullYear()]) : null, m.notes].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <button className="icon-btn" title={tr("Supprimer")} aria-label={tr("Supprimer")} onClick={() => removeFrom(conditions)(m)}><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2col">
        <div className="card">
          <div className="section-header u-mb-12">
            <h2 className="section-title"><Icon name="phone-call" className="u-c-red" />{tr("Contacts d'urgence")}</h2>
            <button className="btn u-btn-sm" onClick={() => setAdding(adding === 'contact' ? null : 'contact')}><Icon name="plus" />{tr("Ajouter")}</button>
          </div>
          {adding === 'contact' && (
            <InlineAdd
              submitLabel="Ajouter le contact"
              onCancel={() => setAdding(null)}
              onSubmit={addTo(contacts, "Contact d'urgence")}
              fields={[
                { name: 'name', label: 'Nom', max: 120, required: true },
                { name: 'relation', label: 'Lien (ex : conjoint, parent)', max: 80 },
                { name: 'phone', label: 'Téléphone', type: 'tel', max: 30, required: true },
              ]}
            />
          )}
          <div className="u-col-gap10">
            {listState(contacts, "Aucun contact d'urgence enregistré.")}
            {(contacts.items || []).map((c) => (
              <div key={c.id} className="contact-card">
                <div className="contact-avatar" style={{ background: 'linear-gradient(135deg,#f43f5e,#fb7185)', color: '#fff' }}>{initialsOf(c.name)}</div>
                <div className="contact-info">
                  <div className="contact-name">{c.name}</div>
                  {c.relation && <div className="contact-role">{c.relation}</div>}
                  <div className="contact-role">{c.phone}</div>
                </div>
                <div className="contact-actions">
                  <a className="icon-btn" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} title={tr("Appeler")} aria-label={tr("Appeler {0}", [c.name])}><Icon name="phone" /></a>
                  <button className="icon-btn" title={tr("Supprimer")} aria-label={tr("Supprimer")} onClick={() => removeFrom(contacts)(c)}><Icon name="trash" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="section-header u-mb-12">
            <h2 className="section-title"><Icon name="shield-lock" className="u-c-green" />{tr("Confidentialité & données")}</h2>
            <span className="u-fs10-tertiary">{tr("Loi 18-11 · Décret 92-276")}</span>
          </div>
          <div className="u-col-gap12">
            {SWITCHES.map((s, i) => (
              <div key={s.key} className={i < SWITCHES.length - 1 ? 'u-t40' : undefined} style={i === SWITCHES.length - 1 ? { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' } : undefined}>
                <div><div className="u-fs12-5-500">{tr(s.title)}</div><div className="u-fs10-5-tertiary">{tr(s.text)}</div></div>
                <label className="switch"><input type="checkbox" checked={switches[s.key]} onChange={toggleSwitch(s.key)} aria-label={tr(s.title)} /><div className="switch-track"></div></label>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '12px', padding: '10px', background: 'var(--color-brand-subtle)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-sm)', fontSize: '10.5px', color: 'var(--text-secondary)' }}>
            <Icon name="shield-check" style={{ color: 'var(--color-brand)', marginRight: '5px' }} />
            {tr("Vos choix sont enregistrés dans votre compte avec le bouton « Sauvegarder ». Données accessibles à vous seul, conformément à la loi n° 18-11 relative à la santé.")}
          </div>
        </div>
      </div>
    </div>
  );
}
