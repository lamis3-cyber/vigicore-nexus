import { tr } from '../../i18n/translate.js';
// Shown for any nav item whose page hasn't been migrated from the original
// HTML yet. Swap this out view-by-view as each one gets converted, following
// the exact same pattern as PatientDashboard.jsx.
export default function ComingSoon({ label }) {
  return (
    <div className="view is-active">
      <div className="page-header">
        <div>
          <h1 className="page-title">{tr(label)}</h1>
        </div>
      </div>
      <div className="card">
        <p style={{ color: 'var(--text-secondary)' }}>
          {tr("Cette page n'a pas encore été migrée vers React. Elle suit le même modèle que le Dashboard — dites-moi laquelle convertir ensuite.")}
        </p>
      </div>
    </div>
  );
}
