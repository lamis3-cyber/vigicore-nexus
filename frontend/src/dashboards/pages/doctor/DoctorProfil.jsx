import { useState } from 'react';
import Icon from '../../components/Icon';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-doc-profil (doctor scope), 1:1 with the
// original's static markup — identity card (avatar, name, N° ordre,
// establishment, badges) + editable form fields + a security/access
// notice card.
//
// Notes on fidelity:
//  - Reached from the topbar avatar's "Ouvrir le profil" button — this
//    was previously broken because AppLayout hardcoded 'profil' (the
//    patient-only route id) for every role instead of using the
//    original's profileView() map; see PROFILE_ID_BY_ROLE in
//    navConfig.js and the fix in AppLayout.jsx.
//  - The original's "Sauvegarder" button just toasts (no real
//    persistence) — kept identical here rather than inventing new
//    save/cancel state, since the source itself doesn't have it on
//    this page (unlike doc-parametres, which does).
//
// Doctor portal audit fix (Step 3A §1): this page used to hardcode
// "Dr. Karim Benali" / "Clinique El Azhar" for every doctor account —
// including the three organization-employed doctors (chu.medecin@,
// clinique.medecin@, centre.medecin@), who would see someone else's
// name and workplace on their own profile. Name/initials/establishment
// now come from useAuth()'s session user, same as every other
// session-derived page (DoctorDashboard.jsx, ClinParametres.jsx, …).
// Standalone doctors (no orgId — see AuthContext.jsx) get a generic,
// non-invented "Cabinet indépendant" label instead of a fabricated
// clinic name. Specialty/domaines/téléphone/N° ordre have no
// per-doctor value anywhere in the data model, so they stay
// user-editable demo defaults (same as before) rather than invented
// per-account facts.
// ═══════════════════════════════════════════════════════════════

export default function DoctorProfil() {
  const toast = useToast();
  const { user } = useAuth();

  const displayName = user?.name || '';
  const initials = user?.initials || '?';
  const nameParts = displayName.replace(/^Dr\.\s*/, '').split(' ');
  const [prenom, setPrenom] = useState(nameParts[0] || '');
  const [nom, setNom] = useState(nameParts.slice(1).join(' '));
  const [specialite, setSpecialite] = useState('');
  const [etablissement, setEtablissement] = useState(user?.orgName || '');
  const [domaines, setDomaines] = useState('');
  const [tel, setTel] = useState('');

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Mon")} <span className="page-title-accent">{tr("Profil")}</span> {tr("praticien")}</h1></div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={() => toast('success', tr("Sauvegardé"), tr("Profil praticien mis à jour"), 'ti ti-circle-check')}>
            <Icon name="device-floppy" />{tr("Sauvegarder")}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="u-t5">
          <div className="u-t139">{initials}</div>
          <div className="u-flex-1">
            <div className="u-t6">{displayName}</div>
            <div className="u-t9">{tr("N° ordre :")} <span className="u-mono">{tr("non renseigné")}</span>{etablissement ? ` · ${etablissement}` : ''}</div>
            <div className="u-t42"></div>
          </div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="docProfPrenom">{tr("Prénom")}</label><input id="docProfPrenom" className="form-input" value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="docProfNom">{tr("Nom de famille")}</label><input id="docProfNom" className="form-input" value={nom} onChange={(e) => setNom(e.target.value)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="docProfSpecialite">{tr("Spécialité")}</label><input id="docProfSpecialite" className="form-input" value={specialite} onChange={(e) => setSpecialite(e.target.value)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="docProfEtablissement">{tr("Établissement")}</label><input id="docProfEtablissement" className="form-input" value={etablissement} onChange={(e) => setEtablissement(e.target.value)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="docProfDomaines">{tr("Domaines de vigilance habilités")}</label><input id="docProfDomaines" className="form-input" value={domaines} onChange={(e) => setDomaines(e.target.value)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="docProfTel">{tr("Téléphone professionnel")}</label><input id="docProfTel" className="form-input" value={tel} onChange={(e) => setTel(e.target.value)} /></div>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="shield-lock" className="u-c-brand" />{tr("Sécurité & accès")}</h2></div>
        <div className="alert-banner alert-banner--cyan">
          <Icon name="lock" />
          <div>
            <div className="alert-banner-title">{tr("Session praticien chiffrée")}</div>
            <div className="alert-banner-text">{tr("Accès aux dossiers patients tracé et limité aux patients que vous suivez, conformément au secret médical et à la loi n° 18-11 relative à la santé.")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
