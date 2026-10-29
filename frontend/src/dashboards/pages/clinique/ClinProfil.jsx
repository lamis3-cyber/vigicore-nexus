import { useState } from 'react';
import Icon from '../../components/Icon';
import { useToast } from '../../context/ToastContext';
import { tr } from '../../../i18n/translate.js';

// Converted from #view-clin-profil, 1:1 with the original's static
// markup, plus the same vcPersistSave/Restore local persistence for
// the two named fields (auto-field-30/31).
const PERSIST_PREFIX = 'vigicore_';
function loadField(id, fallback) {
  try { const raw = localStorage.getItem(PERSIST_PREFIX + id); return raw === null ? fallback : raw; } catch { return fallback; }
}
function saveField(id, value) {
  try { localStorage.setItem(PERSIST_PREFIX + id, value); } catch { /* fail silently */ }
}

export default function ClinProfil() {
  const toast = useToast();
  const [nom, setNom] = useState(() => loadField('auto-field-30', ''));
  const [adresse, setAdresse] = useState(() => loadField('auto-field-31', ''));

  function field(id, value, setter) {
    return { value, onChange: (e) => { setter(e.target.value); saveField(id, e.target.value); } };
  }

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Mon")} <span className="page-title-accent">{tr("Profil")}</span></h1></div>
        <div className="page-actions">
          <button className="btn btn--primary" onClick={() => toast('success', tr("Sauvegardé"), tr("Profil clinique mis à jour"), 'ti ti-circle-check')}><Icon name="device-floppy" />{tr("Sauvegarder")}</button>
        </div>
      </div>
      <div className="card">
        <div className="u-t5">
          <div className="u-t138">{(nom || 'CL').trim().slice(0, 2).toUpperCase()}</div>
          <div className="u-flex-1">
            <div className="u-t6">{nom || tr("Clinique")}</div>
            <div className="u-t9">{tr("N° établissement :")} <span className="u-mono">{tr("non renseigné")}</span></div>
          </div>
        </div>
        <div className="form-row-2">
          <div className="form-group"><label className="form-label" htmlFor="clinProfilNom">{tr("Nom de la clinique")}</label><input id="clinProfilNom" className="form-input" {...field('auto-field-30', nom, setNom)} /></div>
          <div className="form-group"><label className="form-label" htmlFor="clinProfilAdresse">{tr("Adresse")}</label><input id="clinProfilAdresse" className="form-input" {...field('auto-field-31', adresse, setAdresse)} /></div>
        </div>
      </div>
    </div>
  );
}
