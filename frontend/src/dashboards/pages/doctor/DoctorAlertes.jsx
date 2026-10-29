import { useState } from 'react';
import Icon from '../../components/Icon';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { DR_ALERTS, DR_DOMAIN_CHIP, logAudit, isAlertAckedForUser, alertAckMetaForUser, ackAlertForUser } from '../../data/doctorVigilance';
import { DECLARATION_DOMAINS } from '../../domain/declaration';
import { tr } from '../../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Converted from #view-doc-alertes (doctor scope), 1:1 with the
// original's renderDrAlerts() / alertCardHTML() / filterDrAlerts() /
// acknowledgeAlert().
//
// Notes on fidelity:
//  - Domain filter bar: "Toutes" + whichever of the 5 canonical
//    domains (DECLARATION_DOMAINS) actually have at least one alert in
//    DR_ALERTS, in canonical order. Derived from the data rather than
//    hardcoded so the bar never drifts from what DR_ALERTS actually
//    contains: today that's still Pharmacovigilance/Matériovigilance/
//    Cosmétovigilance/Réactovigilance (no Chemovigilance alert exists
//    in the seed data), so a 'Chemovigilance' tab correctly does not
//    render — an empty tab with no matching alerts would be confusing
//    UX, not "supporting" the domain. If a Chemovigilance alert is
//    ever added to DR_ALERTS, its filter tab appears automatically,
//    no code change needed here.
//  - alertCardHTML(a, compact): this page always renders the
//    non-compact form (compact is only used elsewhere, e.g. dashboard
//    widgets) — so the "Acquitter" button is shown whenever !a.ack,
//    exactly as ported.
//  - Acknowledged alerts get the `.is-acknowledged` class (dims them,
//    per theme.css) and their title gets the "· acquittée par X le Y"
//    suffix — both straight ports of the original template string.
//  - acknowledgeAlert() mutates DR_ALERTS in place, stamps ackBy with
//    the current user's name (see DoctorDeclarations.jsx's identical
//    note re: ROLE_CONFIG[currentRole].name -> useAuth().user.name),
//    logs an audit entry, then toasts — same order as the source.
// ═══════════════════════════════════════════════════════════════

const DOMAINS = DECLARATION_DOMAINS.filter((d) => DR_ALERTS.some((a) => a.domain === d));
const FILTERS = [{ id: 'all', label: 'Toutes' }, ...DOMAINS.map((d) => ({ id: d, label: d }))];

const LEVEL_META = {
  red: { banner: 'red', icon: 'rotate-clockwise' },
  amber: { banner: 'amber', icon: 'alert-triangle' },
  cyan: { banner: 'cyan', icon: 'info-circle' },
};

export default function DoctorAlertes() {
  const toast = useToast();
  const { user } = useAuth();

  // DR_ALERTS is a shared mutable array — forceTick re-renders after
  // in-place edits, same pattern as DoctorPatients.jsx / DoctorDeclarations.jsx.
  const [, forceTick] = useState(0);
  const rerender = () => forceTick((n) => n + 1);

  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? DR_ALERTS : DR_ALERTS.filter((a) => a.domain === filter);

  function acknowledgeAlert(id) {
    const a = DR_ALERTS.find((x) => x.id === id);
    if (!a) return;
    ackAlertForUser(a, user);
    logAudit('alert', a.id, `Alerte ${a.ref} (lot ${a.lot}) acquittée`, user?.name, user?.organizationId ?? null);
    rerender();
    toast('success', tr("Alerte acquittée"), a.ref + ' marquée comme traitée', 'ti ti-circle-check');
  }

  return (
    <div className="view is-active">
      <div className="page-header">
        <div><h1 className="page-title">{tr("Centre")} <span className="page-title-accent">{tr("d'alertes")}</span></h1></div>
      </div>

      <div className="domain-filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`filter-tab${filter === f.id ? ' is-active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {tr(f.label)}
          </button>
        ))}
      </div>

      <div className="u-col-gap10">
        {filtered.length === 0 && (
          <EmptyState
            icon="shield-check"
            tone="ok"
            title="Aucune alerte"
            text={filter === 'all'
              ? "Aucune alerte de sécurité ni rappel produit ne concerne votre activité pour le moment."
              : "Aucune alerte dans ce domaine pour le moment."}
          />
        )}
        {filtered.map((a) => {
          const meta = LEVEL_META[a.level] || LEVEL_META.cyan;
          const acked = isAlertAckedForUser(a, user);
          const ackMeta = alertAckMetaForUser(a, user);
          return (
            <div
              key={a.id}
              className={`alert-banner alert-banner--${meta.banner}${acked ? ' is-acknowledged' : ''}`}
              role="alert"
              data-domain={a.domain}
            >
              <Icon name={meta.icon} />
              <div className="u-flex-1">
                <div className="alert-banner-title">
                  {tr(a.title)}
                  {acked && <span className="u-fs10-tertiary">{tr("· acquittée par {0} le {1}", [ackMeta.by || 'un utilisateur', ackMeta.at || ''])}</span>}
                </div>
                <div className="alert-banner-text">
                  {tr(a.text)}<br />
                  <span className="u-fs10-tertiary">
                    {tr("Réf.")} {a.ref} · {a.date} · <span className={`chip chip--${DR_DOMAIN_CHIP[a.domain]} u-t17`}>{tr(a.domain)}</span>
                  </span>
                </div>
              </div>
              {!acked && (
                <button className="btn btn--danger u-t90" onClick={() => acknowledgeAlert(a.id)}>
                  <Icon name="circle-check" />{tr("Acquitter")}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
