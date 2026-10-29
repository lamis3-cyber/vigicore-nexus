import { useState } from 'react';
import MySubmissions from './MySubmissions';
import OrgQueue from './OrgQueue';
import PatientSharedList from './PatientSharedList';
import { tr } from '../../i18n/translate.js';
import { getCurrentAuthUser } from '../context/AuthContext';

// Point d'entrée UNIQUE des pages « Déclarations » : un seul bloc à onglets au lieu de tableaux empilés.
//   · Déclarations                le tableau historique de la page (passé en `children`), affiché en premier
//   · Mes envois                  vue personnelle (envois à la vigilance + enregistrements internes), lue sur le serveur
//   · File de l'établissement     dossiers réels de l'établissement, selon les droits (absent pour un patient : queue={false})
// Les onglets non ouverts ne chargent rien et ne s'affichent pas : plus de doublon visuel.
const TABS = [
  { id: 'all', label: 'Déclarations' },
  { id: 'mine', label: 'Mes envois' },
  { id: 'queue', label: "File de l'établissement" },
  { id: 'patients', label: 'De mes patients' },
];

export default function DeclarationsHub({ queue = true, children }) {
  const doctor = getCurrentAuthUser()?.role === 'doctor';
  const tabs = TABS.filter((t) => (t.id === 'queue' ? queue : t.id === 'all' ? Boolean(children) : t.id === 'patients' ? doctor : true));
  // Le responsable vigilance arrive directement sur la file de son établissement (ce qu'il doit traiter).
  const reviewer = getCurrentAuthUser()?.role === 'vigilance_responsible';
  const [tab, setTab] = useState(reviewer && tabs.some((t) => t.id === 'queue') ? 'queue' : tabs[0].id);
  const active = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  return (
    <>
      <div className="filter-tabs" role="tablist" aria-label={tr("Vues des déclarations")} style={{ marginBottom: 12 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`decl-tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls="decl-hub-panel"
            className={`filter-tab${active === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {tr(t.label)}
          </button>
        ))}
      </div>
      <div id="decl-hub-panel" role="tabpanel" aria-labelledby={`decl-tab-${active}`}>
        {active === 'all' && children}
        {active === 'mine' && <MySubmissions />}
        {active === 'queue' && queue && <OrgQueue />}
        {active === 'patients' && doctor && <PatientSharedList />}
      </div>
    </>
  );
}
