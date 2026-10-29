import { useState } from 'react';
import Icon from '../../components/Icon';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-pharm-profil (pharmacien scope), 1:1 with the
// original's static markup — identity card (avatar, name, N°
// agrément, officine, badges) + editable form fields + a
// security/access notice card.
//
// Notes on fidelity:
//  - Reached only from the topbar avatar's "Ouvrir le profil" button
//    (PROFILE_ID_BY_ROLE.pharmacien = 'pharm-profil' in navConfig.js)
//    — there is no sidebar rail entry for it in the original either.
//  - The original's "Sauvegarder" button just toasts (no real
//    persistence) — kept identical here rather than inventing new
//    save/cancel state, same convention already used in
//    DoctorProfil.jsx.
//
// Pharmacist portal audit fix (Step 3B §1): this page used to
// hardcode "Mehdi Saadi" / "Pharmacie El Badr" for every pharmacist
// account — including the standalone account itself (whose real seat
// name is "Yasmine Cherif", not "Mehdi Saadi" — see AuthContext.jsx)
// and the two organization-employed pharmacists (Nadia Bouzid at CHU
// Alger, Riad Kaced at Clinique El Fedjr), who would see someone
// else's name and workplace on their own profile. Name/initials now
// come from useAuth()'s session user, same pattern as
// DoctorProfil.jsx. "Officine" defaults to the session's
// organization name for organization-employed pharmacists, and to
// "Pharmacie El Badr" — the standalone account's own established
// identity, used consistently across the rest of this portal (see
// PharmDashboard.jsx/PharmStock.jsx) — for the standalone account,
// rather than inventing a workplace for either case.
// ═══════════════════════════════════════════════════════════════

export default function PharmProfil() {
  const toast = useToast();
  const { user } = useAuth();

  const displayName = user?.name || '';
  const initials = user?.initials || '?';
  const [nameParts0, ...nameRest] = displayName.split(' ');
  const [prenom, setPrenom] = useState(nameParts0 || '');
  const [nom, setNom] = useState(nameRest.join(' '));
  const [officine, setOfficine] = useState(user?.orgName || '');
  const [adresse, setAdresse] = useState('');
  const [tel, setTel] = useState('');
  const [agrement, setAgrement] = useState('');

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Mon")} <span className="page-title-accent">{tr("Profil")}</span> {tr("pharmacien")}</h1></div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={() => toast('success', tr("Sauvegardé"), tr("Profil pharmacien mis à jour"), 'ti ti-circle-check')}>
            <Icon name="device-floppy" />{tr("Sauvegarder")}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="u-t5">
          <div className="u-t137">{initials}</div>
          <div className="u-flex-1">
            <div className="u-t6">{displayName}</div>
            <div className="u-t9">{tr("N° agrément :")} <span className="u-mono">{agrement || tr("non renseigné")}</span>{(officine || adresse) ? ` · ${[officine, adresse].filter(Boolean).join(', ')}` : ''}</div>
            <div className="u-t42">
              <span className="chip chip--green"><Icon name="circle-check" className="u-t16" />{tr("Pharmacien agréé ANPP")}</span>
              <span className="chip chip--cyan">{tr("Officine ouverte au public")}</span>
              <span className="chip u-t35">{tr("Partenaire VigiCore depuis 2022")}</span>
            </div>
          </div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="pharmProfPrenom">{tr("Prénom")}</label><input id="pharmProfPrenom" className="form-input" value={prenom} onChange={(e) => setPrenom(e.target.value)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="pharmProfNom">{tr("Nom de famille")}</label><input id="pharmProfNom" className="form-input" value={nom} onChange={(e) => setNom(e.target.value)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="pharmProfOfficine">{tr("Officine")}</label><input id="pharmProfOfficine" className="form-input" value={officine} onChange={(e) => setOfficine(e.target.value)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="pharmProfAdresse">{tr("Adresse")}</label><input id="pharmProfAdresse" className="form-input" value={adresse} onChange={(e) => setAdresse(e.target.value)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="pharmProfTel">{tr("Téléphone professionnel")}</label><input id="pharmProfTel" className="form-input" value={tel} onChange={(e) => setTel(e.target.value)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="pharmProfAgrement">{tr("N° agrément ANPP")}</label><input id="pharmProfAgrement" className="form-input" value={agrement} onChange={(e) => setAgrement(e.target.value)} /></div>
        </div>
      </div>

      <div className="card">
        <div className="section-header"><h2 className="section-title"><Icon name="shield-lock" className="u-c-brand" />{tr("Sécurité & accès")}</h2></div>
        <div className="alert-banner alert-banner--cyan">
          <Icon name="lock" />
          <div>
            <div className="alert-banner-title">{tr("Session officine chiffrée")}</div>
            <div className="alert-banner-text">{tr("Accès aux dossiers patients tracé et limité aux patients desservis par votre officine, conformément au secret professionnel et à la loi n° 18-11 relative à la santé.")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
