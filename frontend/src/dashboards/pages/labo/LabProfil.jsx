import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { usePersonalSingleton } from '../../lib/usePersonal';
import { orgApi } from '../../services/orgApi';
import { tr } from '../../../i18n/translate.js';

// Laboratory profile.
//  - Identity: name from the session; laboratory details (name, address, phone, ANPP approval)
//    are saved in the account (/api/personal/singleton/lab_profile).
//  - "Personnel autorisé": ACTIVE members of the laboratory's organization (/api/orgs/:id/members).
//    A standalone laboratory account (no organization) has no roster, and the page says so.
//  - Certifications: VigiCore has no certification registry; nothing is invented.

const ROLE_LABEL = {
  LABO: 'Laboratoire',
  DOCTOR: 'Médecin',
  PHARMACIEN: 'Pharmacien',
  HOSPITAL: 'Personnel hospitalier',
  ORG_ADMIN: 'Administrateur',
  VIGILANCE_REVIEWER: 'Responsable vigilance',
};

export default function LabProfil() {
  const toast = useToast();
  const { user } = useAuth();

  const displayName = user?.name || '';
  const initials = user?.initials || '?';
  const orgName = user?.orgName || '';

  const orgId = user?.orgId || null;
  const profile = usePersonalSingleton('lab_profile');

  const [nom, setNom] = useState(displayName);
  const [adresse, setAdresse] = useState('');
  const [tel, setTel] = useState('');
  const [agrement, setAgrement] = useState('');
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState(null); // null = loading
  const [staffError, setStaffError] = useState(null);

  useEffect(() => {
    if (!profile.loaded) return;
    const d = profile.data || {};
    if (d.nom) setNom(d.nom);
    setAdresse(d.adresse || '');
    setTel(d.telephone || '');
    setAgrement(d.agrement || '');
  }, [profile.loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!orgId) { setStaff([]); return undefined; }
    let off = false;
    orgApi.members(orgId).then((r) => {
      if (off) return;
      if (r.ok) setStaff(r.data.members || []);
      else { setStaff([]); setStaffError(r.error); }
    });
    return () => { off = true; };
  }, [orgId]);

  const save = async () => {
    setSaving(true);
    const data = Object.fromEntries(Object.entries({ nom, adresse, telephone: tel, agrement }).filter(([, v]) => v.trim() !== ''));
    const r = await profile.save(data);
    setSaving(false);
    if (r.ok) toast('success', tr("Sauvegardé"), tr("Profil laboratoire mis à jour"), 'ti ti-circle-check');
    else toast('error', tr("Enregistrement impossible"), r.error, 'alert-triangle');
  };

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Mon")} <span className="page-title-accent">{tr("Profil")}</span></h1></div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={save} disabled={saving || !profile.loaded}>
            <Icon name="device-floppy" />{saving ? tr("Enregistrement…") : tr("Sauvegarder")}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="u-t5">
          <div className="u-t136">{initials}</div>
          <div className="u-flex-1">
            <div className="u-t6">{displayName}</div>
            <div className="u-t9">{tr("Agrément ANPP :")} <span className="u-mono">{agrement || tr("non renseigné")}</span>{orgName ? ` · ${orgName}` : ''}</div>
            <div className="u-t42"></div>
          </div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="labProfilNom">{tr("Nom du laboratoire")}</label><input id="labProfilNom" className="form-input" value={nom} onChange={(e) => setNom(e.target.value)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="labProfilAdresse">{tr("Adresse")}</label><input id="labProfilAdresse" className="form-input" value={adresse} onChange={(e) => setAdresse(e.target.value)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="labProfilTel">{tr("Téléphone professionnel")}</label><input id="labProfilTel" className="form-input" value={tel} onChange={(e) => setTel(e.target.value)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="labProfilAgrement">{tr("N° agrément ANPP")}</label><input id="labProfilAgrement" className="form-input" value={agrement} onChange={(e) => setAgrement(e.target.value)} /></div>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="users-group" className="u-c-cyan" />{tr("Personnel autorisé")}</h2></div>
        <div className="u-col-gap8">
          {staff === null && <div className="u-fs-12 u-t102">{tr("Chargement…")}</div>}
          {staffError && <div className="u-fs-12 u-c-red">{staffError}</div>}
          {staff !== null && !orgId && <div className="u-fs-12 u-t102">{tr("Compte indépendant : aucune organisation, donc aucun personnel rattaché.")}</div>}
          {staff !== null && orgId && !staffError && staff.length === 0 && <div className="u-fs-12 u-t102">{tr("Aucun membre du personnel enregistré.")}</div>}
          {(staff || []).map((s) => (
            <div className="card u-t88" key={s.userId}>
              <span className="u-fs12-500">{s.displayName}</span>
              <span className="u-fs-12 u-t102">{tr(ROLE_LABEL[s.role] || s.role)}{s.memberRole === 'ADMIN' ? ` · ${tr("Administrateur")}` : ''}</span>
              <span className="badge badge--green">{tr("Actif")}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="certificate" className="u-c-amber" />{tr("Certifications")}</h2></div>
        <div className="u-fs-12 u-t102">{tr("Les certifications (ISO 15189…) ne sont pas encore gérées dans VigiCore. Présentez vos certificats à l'autorité sur demande.")}</div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="shield-lock" className="u-c-brand" />{tr("Sécurité & accès")}</h2></div>
        <div className="alert-banner alert-banner--cyan">
          <Icon name="lock" />
          <div>
            <div className="alert-banner-title">{tr("Session laboratoire chiffrée")}</div>
            <div className="alert-banner-text">{tr("Accès aux dossiers patients tracé et limité aux patients dont un échantillon a été analysé par ce laboratoire, conformément au secret professionnel et à la loi n° 18-11 relative à la santé.")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
