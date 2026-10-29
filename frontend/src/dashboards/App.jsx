import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import { DR_DECLARATIONS, DR_PATIENTS, AUDIT_LOG } from './data/doctorVigilance';
import { LAB_DECLARATIONS } from './data/laboVigilance';
import { registerVigilanceArrays, hydrateVigilance, hydrateRecords, onVigilanceError } from './data/vigilanceStore';
import { getSavedLang } from './data/settingsStore';
import { useI18n } from '../i18n/index.jsx';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { CallProvider } from './context/CallContext';
import CallOverlay from './components/CallOverlay';
import LoginPage from './pages/LoginPage';
import AppLayout from './layouts/AppLayout';
const PatientDashboard = lazy(() => import('./pages/patient/PatientDashboard'));
const PatientDeclarer = lazy(() => import('./pages/patient/PatientDeclarer'));
const PatientDossiers = lazy(() => import('./pages/patient/PatientDossiers'));
const PatientTraitements = lazy(() => import('./pages/patient/PatientTraitements'));
const PatientProduits = lazy(() => import('./pages/patient/PatientProduits'));
const PatientAlertes = lazy(() => import('./pages/patient/PatientAlertes'));
const PatientRdv = lazy(() => import('./pages/patient/PatientRdv'));
const PatientMedecins = lazy(() => import('./pages/patient/PatientMedecins'));
const Messenger = lazy(() => import('./pages/messenger/Messenger'));
const PatientInformation = lazy(() => import('./pages/patient/PatientInformation'));
const PatientProfil = lazy(() => import('./pages/patient/PatientProfil'));
const PatientParametres = lazy(() => import('./pages/patient/PatientParametres'));
const DoctorDashboard = lazy(() => import('./pages/doctor/DoctorDashboard'));
const DoctorPatients = lazy(() => import('./pages/doctor/DoctorPatients'));
const DoctorDeclarer = lazy(() => import('./pages/doctor/DoctorDeclarer'));
const DoctorDeclarations = lazy(() => import('./pages/doctor/DoctorDeclarations'));
const DoctorAlertes = lazy(() => import('./pages/doctor/DoctorAlertes'));
const DoctorLabos = lazy(() => import('./pages/doctor/DoctorLabos'));
const DoctorParametres = lazy(() => import('./pages/doctor/DoctorParametres'));
const DoctorDocumentation = lazy(() => import('./pages/doctor/DoctorDocumentation'));
const DoctorProfil = lazy(() => import('./pages/doctor/DoctorProfil'));
const DoctorVerification = lazy(() => import('./pages/doctor/DoctorVerification'));
const PharmDashboard = lazy(() => import('./pages/pharmacien/PharmDashboard'));
const PharmStock = lazy(() => import('./pages/pharmacien/PharmStock'));
const PharmCommandes = lazy(() => import('./pages/pharmacien/PharmCommandes'));
const MarketOrders = lazy(() => import('./pages/market/MarketOrders'));
const PharmVerification = lazy(() => import('./pages/pharmacien/PharmVerification'));
const PharmDeclarer = lazy(() => import('./pages/pharmacien/PharmDeclarer'));
const PharmDeclarations = lazy(() => import('./pages/pharmacien/PharmDeclarations'));
const PharmRappels = lazy(() => import('./pages/pharmacien/PharmRappels'));
const PharmParametres = lazy(() => import('./pages/pharmacien/PharmParametres'));
const PharmProfil = lazy(() => import('./pages/pharmacien/PharmProfil'));
const LabDashboard = lazy(() => import('./pages/labo/LabDashboard'));
const LabDeclarer = lazy(() => import('./pages/labo/LabDeclarer'));
const LabDeclarations = lazy(() => import('./pages/labo/LabDeclarations'));
const LabRecherche = lazy(() => import('./pages/labo/LabRecherche'));
const LabReactifs = lazy(() => import('./pages/labo/LabReactifs'));
const LabSurveillance = lazy(() => import('./pages/labo/LabSurveillance'));
const LabAlertes = lazy(() => import('./pages/labo/LabAlertes'));
const LabParametres = lazy(() => import('./pages/labo/LabParametres'));
const LabProfil = lazy(() => import('./pages/labo/LabProfil'));
const HospDashboard = lazy(() => import('./pages/hospital/HospDashboard'));
const HospDeclarer = lazy(() => import('./pages/hospital/HospDeclarer'));
const HospDeclarations = lazy(() => import('./pages/hospital/HospDeclarations'));
const HospProduits = lazy(() => import('./pages/hospital/HospProduits'));
const HospAlertes = lazy(() => import('./pages/hospital/HospAlertes'));
const HospPersonnel = lazy(() => import('./pages/hospital/HospPersonnel'));
const HospRapports = lazy(() => import('./pages/hospital/HospRapports'));
const AuditLog = lazy(() => import('./pages/institutional/AuditLog'));
const HospParametres = lazy(() => import('./pages/hospital/HospParametres'));
const ClinDashboard = lazy(() => import('./pages/clinique/ClinDashboard'));
const ClinDeclarer = lazy(() => import('./pages/clinique/ClinDeclarer'));
const ClinDeclarations = lazy(() => import('./pages/clinique/ClinDeclarations'));
const ClinProduits = lazy(() => import('./pages/clinique/ClinProduits'));
const ClinAlertes = lazy(() => import('./pages/clinique/ClinAlertes'));
const ClinRapports = lazy(() => import('./pages/clinique/ClinRapports'));
const ClinParametres = lazy(() => import('./pages/clinique/ClinParametres'));
const ClinProfil = lazy(() => import('./pages/clinique/ClinProfil'));
const CmDashboard = lazy(() => import('./pages/centremedical/CmDashboard'));
const CmDeclarer = lazy(() => import('./pages/centremedical/CmDeclarer'));
const CmDeclarations = lazy(() => import('./pages/centremedical/CmDeclarations'));
const CmProduits = lazy(() => import('./pages/centremedical/CmProduits'));
const CmAlertes = lazy(() => import('./pages/centremedical/CmAlertes'));
const CmRapports = lazy(() => import('./pages/centremedical/CmRapports'));
const CmParametres = lazy(() => import('./pages/centremedical/CmParametres'));
const CmProfil = lazy(() => import('./pages/centremedical/CmProfil'));
const MedicalStaffDashboard = lazy(() => import('./pages/medicalstaff/MedicalStaffDashboard'));
const MedicalStaffDeclarer = lazy(() => import('./pages/medicalstaff/MedicalStaffDeclarer'));
const MedicalStaffDeclarations = lazy(() => import('./pages/medicalstaff/MedicalStaffDeclarations'));
const MedicalStaffProfil = lazy(() => import('./pages/medicalstaff/MedicalStaffProfil'));
const AuditorDashboard = lazy(() => import('./pages/auditor/AuditorDashboard'));
const SupplierDashboard = lazy(() => import('./pages/supplier/SupplierDashboard'));
const SupplierNotifications = lazy(() => import('./pages/supplier/SupplierNotifications'));
const SupplierDeclarer = lazy(() => import('./pages/supplier/SupplierDeclarer'));
const SupplierDeclarations = lazy(() => import('./pages/supplier/SupplierDeclarations'));
const SupplierOrganisations = lazy(() => import('./pages/supplier/SupplierOrganisations'));
const SupplierCatalogue = lazy(() => import('./pages/supplier/SupplierCatalogue'));
const SupplierOrderTracking = lazy(() => import('./pages/supplier/SupplierOrderTracking'));
const SupplierHistory = lazy(() => import('./pages/supplier/SupplierHistory'));
const SupplierProducts = lazy(() => import('./pages/supplier/SupplierProducts'));
const SupplierSales = lazy(() => import('./pages/supplier/SupplierSales'));
const SupplierTeam = lazy(() => import('./pages/supplier/SupplierTeam'));
const AuditorDeclarations = lazy(() => import('./pages/auditor/AuditorDeclarations'));
const AuditorProfil = lazy(() => import('./pages/auditor/AuditorProfil'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const OrgDeclarations = lazy(() => import('./pages/admin/OrgDeclarations'));
const OrgNotifications = lazy(() => import('./pages/admin/OrgNotifications'));
const OrgPersonnel = lazy(() => import('./pages/admin/OrgPersonnel'));
const OrganisationPage = lazy(() => import('./pages/organisation/OrganisationPage'));
const ComingSoon = lazy(() => import('./pages/ComingSoon'));
import { NAV_CONFIG, DASHBOARD_ID_BY_ROLE, getPortalKey, supplierPageBlocked } from './config/navConfig';
import { tr } from '../i18n/translate.js';

// Renders the page that matches the current nav selection.
// Migrated so far: patient/dashboard, patient/traitements, patient/declarer,
// patient/declarations, patient/produits, patient/alertes, patient/rdv,
// patient/communication, patient/information, patient/profil,
// patient/parametres, doctor/doc-dashboard, doctor/doc-patients,
// doctor/doc-declarer, doctor/doc-declarations, doctor/doc-alertes,
// doctor/doc-labos, doctor/doc-messagerie, doctor/doc-parametres,
// doctor/doc-documentation, doctor/doc-profil, doctor/doc-verification,
// pharmacist/pharm-dashboard, pharmacist/pharm-stock,
// pharmacist/pharm-commandes, pharmacist/pharm-verification,
// pharmacist/pharm-declarer, pharmacist/pharm-declarations,
// pharmacist/pharm-rappels, pharmacist/pharm-parametres,
// pharmacist/pharm-profil (+ pharmacist reuses doctor/doc-labos and
// doctor/doc-messagerie for its "Labos"/"Messages" rail items, same as
// the original), laboratory_staff/lab-dashboard, laboratory_staff/lab-declarer,
// laboratory_staff/lab-declarations, laboratory_staff/lab-recherche, laboratory_staff/lab-reactifs,
// laboratory_staff/lab-surveillance, laboratory_staff/lab-alertes, laboratory_staff/lab-parametres,
// laboratory_staff/lab-profil (+ laboratory_staff reuses doctor/doc-messagerie and
// doctor/doc-documentation for its "Messages"/"Docs" rail items, same
// as the original), medical_staff/medical-staff-dashboard,
// medical_staff/ms-declarer, medical_staff/ms-declarations,
// medical_staff/medical-staff-profil (dashboard-architecture fix, Step 1 —
// see src/pages/medicalstaff/), auditor/auditor-dashboard,
// auditor/auditor-declarations, auditor/auditor-profil
// (dashboard-architecture fix, Step 2 — see src/pages/auditor/),
// administrator/admin-dashboard (Administrator portal audit, Step 3 —
// see src/pages/admin/AdminDashboard.jsx, one shared component reused
// across hospital-admin/clinique-admin/centremedical-admin).
// Everything else falls back to <ComingSoon/> until converted, following
// the same pattern.
// A hospital/clinique/centre médical is an ORGANIZATION with several
// roles (doctor, pharmacist, laboratory_staff, medical_staff,
// vigilance_responsible, administrator) — see navConfig.js.
// Doctor/Pharmacist/Laboratory Staff at these orgs keep the plain
// 'doctor'/'pharmacist'/'laboratory_staff' role and are routed by the
// checks above/below already in this function (same pages, reused).
// Only the two org-specific roles (vigilance_responsible,
// administrator) need their own routing here, keyed by PORTAL KEY
// (getPortalKey(user), navConfig.js) — never by the business role
// itself, which never encodes an organization type (role/org/
// department refactor §7/§8).
function isHospitalRole(portalKey) {
  return portalKey === 'hospital-qualite' || portalKey === 'hospital-admin';
}
function isCliniqueRole(portalKey) {
  return portalKey === 'clinique-qualite' || portalKey === 'clinique-admin';
}
function isCentreMedicalRole(portalKey) {
  return portalKey === 'centremedical-qualite' || portalKey === 'centremedical-admin';
}
// Administrator-only (never matches a '-qualite' portal key) — the
// shared landing dashboard (AdminDashboard.jsx) is organization-scoped
// but org-type-generic, so ONE route/component covers all three
// organization types (Administrator audit, step "Administrator
// landing page").
function isAdministratorPortal(portalKey) {
  return portalKey === 'hospital-admin' || portalKey === 'clinique-admin' || portalKey === 'centremedical-admin';
}

// Arrivée depuis une fiche produit du site : /dashboard/?page=commandes&offer=<réf>. La page « Commandes » dépend du
// rôle (pharmacien ou administrateur d'établissement) ; un rôle sans page de commandes arrive sur son accueil habituel.
const ORDERS_PAGE_BY_PORTAL = {
  pharmacist: 'pharm-commandes',
  supplier: 'sup-catalogue', // fournisseur : catalogue des fabricants (le suivi et l'historique ont leurs propres pages)
  'hospital-admin': 'org-commandes',
  'clinique-admin': 'org-commandes',
  'centremedical-admin': 'org-commandes',
};
function readEntry() {
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.get('page') !== 'commandes') return null;
    return { page: 'commandes', offer: p.get('offer') || null };
  } catch {
    return null;
  }
}

function PageRouter({ user, activeId, onNavigate, entry, onEntryConsumed }) {
  const role = user.role;
  const portalKey = getPortalKey(user);
  // "Organisation" / "Équipe": join requests + invitations. One shared page for
  // every professional role and for the organization administrator (it picks its
  // own view from the role). Patients and auditors have no organization.
  if (activeId === 'my-org' && role !== 'patient' && role !== 'auditor' && role !== 'supplier') {
    return <OrganisationPage />;
  }
  if (role === 'patient' && activeId === 'dashboard') {
    return <PatientDashboard onNavigate={onNavigate} />;
  }
  // Patient's own records, stored in the account (/api/personal/*)
  if (role === 'patient' && activeId === 'traitements') {
    return <PatientTraitements />;
  }
  if (role === 'patient' && activeId === 'produits') {
    return <PatientProduits onNavigate={onNavigate} />;
  }
  if (role === 'patient' && activeId === 'alertes') {
    return <PatientAlertes onNavigate={onNavigate} />;
  }
  if (role === 'patient' && activeId === 'medecins') {
    return <PatientMedecins />;
  }
  if (role === 'patient' && activeId === 'rdv') {
    return <PatientRdv />;
  }
  if (role === 'patient' && activeId === 'declarer') {
    return <PatientDeclarer onNavigate={onNavigate} />;
  }
  if (role === 'patient' && activeId === 'declarations') {
    return <PatientDossiers onNavigate={onNavigate} />;
  }
  if (role === 'patient' && activeId === 'communication') {
    return <Messenger />;
  }
  if (role === 'patient' && activeId === 'information') {
    return <PatientInformation onNavigate={onNavigate} />;
  }
  if (role === 'patient' && activeId === 'profil') {
    return <PatientProfil />;
  }
  if (role === 'patient' && activeId === 'parametres') {
    return <PatientParametres />;
  }
  if (role === 'doctor' && activeId === 'doc-dashboard') {
    return (
      <DoctorDashboard
        onNavigate={onNavigate}
        onOpenDeclareWizard={() => onNavigate('doc-declarer')}
      />
    );
  }
  if (role === 'doctor' && activeId === 'doc-patients') {
    return <DoctorPatients onNavigate={onNavigate} />;
  }
  if (role === 'doctor' && activeId === 'doc-declarer') {
    return <DoctorDeclarer onNavigate={onNavigate} />;
  }
  if (role === 'doctor' && activeId === 'doc-declarations') {
    return <DoctorDeclarations onNavigate={onNavigate} />;
  }
  if (role === 'doctor' && activeId === 'doc-alertes') {
    return <DoctorAlertes />;
  }
  if (role === 'doctor' && activeId === 'doc-labos') {
    return <DoctorLabos onNavigate={onNavigate} />;
  }
  if (role === 'doctor' && activeId === 'doc-demandes') {
    return <MarketOrders mode="requests" />;
  }
  if (role === 'doctor' && activeId === 'doc-messagerie') {
    return <Messenger />;
  }
  if (role === 'doctor' && activeId === 'doc-parametres') {
    return <DoctorParametres />;
  }
  if (role === 'doctor' && activeId === 'doc-documentation') {
    return <DoctorDocumentation />;
  }
  if (role === 'doctor' && activeId === 'doc-profil') {
    return <DoctorProfil />;
  }
  if (role === 'doctor' && activeId === 'doc-verification') {
    return <DoctorVerification onNavigate={onNavigate} />;
  }
  if (role === 'pharmacist' && activeId === 'pharm-dashboard') {
    return <PharmDashboard onNavigate={onNavigate} />;
  }
  if (role === 'pharmacist' && activeId === 'pharm-stock') {
    return <PharmStock onNavigate={onNavigate} />;
  }
  if (role === 'pharmacist' && activeId === 'pharm-commandes') {
    return <PharmCommandes onNavigate={onNavigate} entry={entry} onEntryConsumed={onEntryConsumed} />;
  }
  if (role === 'pharmacist' && activeId === 'pharm-verification') {
    return <PharmVerification onNavigate={onNavigate} />;
  }
  if (role === 'pharmacist' && activeId === 'pharm-declarer') {
    return <PharmDeclarer onNavigate={onNavigate} />;
  }
  if (role === 'pharmacist' && activeId === 'pharm-declarations') {
    return <PharmDeclarations onNavigate={onNavigate} />;
  }
  if (role === 'pharmacist' && activeId === 'pharm-rappels') {
    return <PharmRappels onNavigate={onNavigate} />;
  }
  if (role === 'pharmacist' && activeId === 'pharm-parametres') {
    return <PharmParametres />;
  }
  if (role === 'pharmacist' && activeId === 'pharm-profil') {
    return <PharmProfil />;
  }
  // Pharmacien's "Labos" and "Messages" rail items deliberately reuse the
  // Doctor portal's own pages (see navConfig.js's comment on this) — same
  // original design as the source HTML.
  if (role === 'pharmacist' && activeId === 'doc-labos') {
    return <DoctorLabos onNavigate={onNavigate} />;
  }
  if (role === 'pharmacist' && activeId === 'doc-messagerie') {
    return <Messenger />;
  }
  if (role === 'laboratory_staff' && activeId === 'lab-dashboard') {
    return <LabDashboard onNavigate={onNavigate} />;
  }
  if (role === 'laboratory_staff' && activeId === 'lab-declarer') {
    return <LabDeclarer onNavigate={onNavigate} />;
  }
  if (role === 'laboratory_staff' && activeId === 'lab-declarations') {
    return <LabDeclarations onNavigate={onNavigate} />;
  }
  if (role === 'laboratory_staff' && activeId === 'lab-recherche') {
    return <LabRecherche onNavigate={onNavigate} />;
  }
  if (role === 'laboratory_staff' && activeId === 'lab-reactifs') {
    return <LabReactifs onNavigate={onNavigate} />;
  }
  if (role === 'laboratory_staff' && activeId === 'lab-surveillance') {
    return <LabSurveillance onNavigate={onNavigate} />;
  }
  if (role === 'laboratory_staff' && activeId === 'lab-alertes') {
    return <LabAlertes />;
  }
  if (role === 'laboratory_staff' && activeId === 'lab-demandes') {
    return <MarketOrders mode="requests" />;
  }
  if (role === 'laboratory_staff' && activeId === 'lab-parametres') {
    return <LabParametres />;
  }
  if (role === 'laboratory_staff' && activeId === 'lab-profil') {
    return <LabProfil />;
  }
  // Labo's "Messages" and "Docs" rail items deliberately reuse the Doctor
  // portal's own pages (see navConfig.js's comment on this) — same
  // original design as the source HTML.
  if (role === 'laboratory_staff' && activeId === 'doc-messagerie') {
    return <Messenger />;
  }
  if (role === 'laboratory_staff' && activeId === 'doc-documentation') {
    return <DoctorDocumentation />;
  }
  // Medical Staff (role: 'medical_staff') — dashboard-architecture fix,
  // Step 1. Routed by plain business role, same as every role above
  // (never by portal key — medical_staff has no CHU/Clinique/Centre
  // Médical variants, see navConfig.js's getPortalKey header).
  if (role === 'medical_staff' && activeId === 'medical-staff-dashboard') {
    return <MedicalStaffDashboard onNavigate={onNavigate} />;
  }
  if (role === 'medical_staff' && activeId === 'ms-declarer') {
    return <MedicalStaffDeclarer onNavigate={onNavigate} />;
  }
  if (role === 'medical_staff' && activeId === 'ms-declarations') {
    return <MedicalStaffDeclarations onNavigate={onNavigate} />;
  }
  if (role === 'medical_staff' && activeId === 'medical-staff-profil') {
    return <MedicalStaffProfil />;
  }
  // Auditor (role: 'auditor') — dashboard-architecture fix, Step 2.
  // Routed by plain business role, same as every role above (never by
  // portal key — Auditor has no CHU/Clinique/Centre Médical variants
  // and no organization at all, see navConfig.js's getPortalKey
  // header and permissions.js's SYSTEM_ROLE_IDS).
  // Fournisseur / distributeur (role: 'supplier') — accueil + statut de vérification ; les autres pages : phase 3.
  // Un employé qui arrive sur une page d'achat (lien direct, ancien bouton, ?page=commandes) retombe sur l'accueil : le menu ne la lui propose pas.
  if (role === 'supplier' && (activeId === 'sup-dashboard' || supplierPageBlocked(user, activeId))) {
    return <SupplierDashboard onNavigate={onNavigate} />;
  }
  if (role === 'supplier' && activeId === 'sup-notifications') {
    return <SupplierNotifications onNavigate={onNavigate} />;
  }
  if (role === 'supplier' && activeId === 'sup-declarer') {
    return <SupplierDeclarer onNavigate={onNavigate} />;
  }
  if (role === 'supplier' && activeId === 'sup-declarations') {
    return <SupplierDeclarations onNavigate={onNavigate} />;
  }
  // Commandes du fournisseur (acheteur « distributeur » ; le serveur tranche : catégorie vérifiée par VigiCore avant toute
  // commande), une page par sujet : catalogue pour commander, suivi des commandes en cours, historique des achats.
  if (role === 'supplier' && (activeId === 'sup-catalogue' || activeId === 'sup-commandes')) {
    return <SupplierCatalogue onNavigate={onNavigate} entry={entry} onEntryConsumed={onEntryConsumed} />;
  }
  // Côté VENTE : ses produits sur la page Services, et les commandes reçues de ses clients (il y répond lui-même).
  if (role === 'supplier' && activeId === 'sup-equipe') {
    return <SupplierTeam />;
  }
  if (role === 'supplier' && activeId === 'sup-produits') {
    return <SupplierProducts onNavigate={onNavigate} />;
  }
  if (role === 'supplier' && activeId === 'sup-ventes') {
    return <SupplierSales onNavigate={onNavigate} />;
  }
  if (role === 'supplier' && activeId === 'sup-suivi') {
    return <SupplierOrderTracking onNavigate={onNavigate} />;
  }
  if (role === 'supplier' && activeId === 'sup-historique') {
    return <SupplierHistory onNavigate={onNavigate} />;
  }
  if (role === 'supplier' && activeId === 'sup-organisations') {
    return <SupplierOrganisations onNavigate={onNavigate} />;
  }
  if (role === 'supplier' && activeId === 'sup-messagerie') {
    return <Messenger />;
  }
  if (role === 'auditor' && activeId === 'auditor-dashboard') {
    return <AuditorDashboard onNavigate={onNavigate} />;
  }
  if (role === 'auditor' && activeId === 'auditor-declarations') {
    return <AuditorDeclarations />;
  }
  if (role === 'auditor' && activeId === 'auditor-profil') {
    return <AuditorProfil />;
  }
  if (isAdministratorPortal(portalKey) && activeId === 'admin-dashboard') {
    return <AdminDashboard onNavigate={onNavigate} />;
  }
  if (isAdministratorPortal(portalKey) && activeId === 'org-declarations') {
    return <OrgDeclarations />;
  }
  if (isAdministratorPortal(portalKey) && (activeId === 'org-personnel' || activeId === 'hosp-personnel')) {
    return <OrgPersonnel onNavigate={onNavigate} />;
  }
  if (isAdministratorPortal(portalKey) && activeId === 'org-commandes') {
    return <MarketOrders entry={entry} onEntryConsumed={onEntryConsumed} />;
  }
  if (isAdministratorPortal(portalKey) && activeId === 'org-notifications') {
    return <OrgNotifications onNavigate={onNavigate} />;
  }
  if (isHospitalRole(portalKey) && activeId === 'hosp-dashboard') {
    return <HospDashboard onNavigate={onNavigate} onOpenDeclareWizard={() => onNavigate('hosp-declarer')} />;
  }
  if (isHospitalRole(portalKey) && activeId === 'hosp-declarer') {
    return <HospDeclarer onNavigate={onNavigate} />;
  }
  if (isHospitalRole(portalKey) && activeId === 'hosp-declarations') {
    return <HospDeclarations onOpenDeclareWizard={() => onNavigate('hosp-declarer')} />;
  }
  if (isHospitalRole(portalKey) && activeId === 'hosp-produits') {
    return <HospProduits onNavigate={onNavigate} />;
  }
  if (isHospitalRole(portalKey) && activeId === 'hosp-alertes') {
    return <HospAlertes />;
  }
  if (isHospitalRole(portalKey) && activeId === 'hosp-personnel') {
    return <HospPersonnel />;
  }
  if (isHospitalRole(portalKey) && activeId === 'hosp-rapports') {
    return <HospRapports />;
  }
  // F5 — shared "Journal d'audit" route, reachable from Hôpital's,
  // Clinique's and Centre Médical's Paramètres page alike (single
  // shared route id + component, per this workstream's scope
  // constraint — no NAV_CONFIG rail entry added since, as before,
  // this stays reachable only via the Paramètres card).
  if ((isHospitalRole(portalKey) || isCliniqueRole(portalKey) || isCentreMedicalRole(portalKey)) && activeId === 'audit-log') {
    return <AuditLog />;
  }
  if (isHospitalRole(portalKey) && activeId === 'hosp-parametres') {
    return <HospParametres onNavigate={onNavigate} />;
  }
  // Hospital's "Messages" rail item deliberately reuses the Doctor
  // portal's own page (see navConfig.js's comment on this) — same
  // original design as the source HTML (hosp-messagerie's single
  // subnav item routes to view 'doc-messagerie').
  if (isHospitalRole(portalKey) && activeId === 'doc-messagerie') {
    return <Messenger />;
  }
  if (isCliniqueRole(portalKey) && activeId === 'clin-dashboard') {
    return <ClinDashboard onNavigate={onNavigate} onOpenDeclareWizard={() => onNavigate('clin-declarer')} />;
  }
  if (isCliniqueRole(portalKey) && activeId === 'clin-declarer') {
    return <ClinDeclarer onNavigate={onNavigate} />;
  }
  if (isCliniqueRole(portalKey) && activeId === 'clin-declarations') {
    return <ClinDeclarations onOpenDeclareWizard={() => onNavigate('clin-declarer')} />;
  }
  if (isCliniqueRole(portalKey) && activeId === 'clin-produits') {
    return <ClinProduits onNavigate={onNavigate} />;
  }
  if (isCliniqueRole(portalKey) && activeId === 'clin-alertes') {
    return <ClinAlertes />;
  }
  if (isCliniqueRole(portalKey) && activeId === 'clin-rapports') {
    return <ClinRapports />;
  }
  if (isCliniqueRole(portalKey) && activeId === 'clin-parametres') {
    return <ClinParametres onNavigate={onNavigate} />;
  }
  if (isCliniqueRole(portalKey) && activeId === 'clin-profil') {
    return <ClinProfil />;
  }
  if (isCliniqueRole(portalKey) && activeId === 'doc-messagerie') {
    return <Messenger />;
  }
  if (isCentreMedicalRole(portalKey) && activeId === 'cm-dashboard') {
    return <CmDashboard onNavigate={onNavigate} onOpenDeclareWizard={() => onNavigate('cm-declarer')} />;
  }
  if (isCentreMedicalRole(portalKey) && activeId === 'cm-declarer') {
    return <CmDeclarer onNavigate={onNavigate} />;
  }
  if (isCentreMedicalRole(portalKey) && activeId === 'cm-declarations') {
    return <CmDeclarations onOpenDeclareWizard={() => onNavigate('cm-declarer')} />;
  }
  if (isCentreMedicalRole(portalKey) && activeId === 'cm-produits') {
    return <CmProduits onNavigate={onNavigate} />;
  }
  if (isCentreMedicalRole(portalKey) && activeId === 'cm-alertes') {
    return <CmAlertes />;
  }
  if (isCentreMedicalRole(portalKey) && activeId === 'cm-rapports') {
    return <CmRapports />;
  }
  if (isCentreMedicalRole(portalKey) && activeId === 'cm-parametres') {
    return <CmParametres onNavigate={onNavigate} />;
  }
  if (isCentreMedicalRole(portalKey) && activeId === 'cm-profil') {
    return <CmProfil />;
  }
  if (isCentreMedicalRole(portalKey) && activeId === 'doc-messagerie') {
    return <Messenger />;
  }
  const items = NAV_CONFIG[portalKey] || NAV_CONFIG[role] || [];
  const match = items.find((i) => i.id === activeId);
  return <ComingSoon label={match?.label || activeId} />;
}

registerVigilanceArrays(DR_DECLARATIONS, LAB_DECLARATIONS, { patients: DR_PATIENTS, audit: AUDIT_LOG });

function AuthedApp() {
  const { user, status, error } = useAuth();
  const toast = useToast();
  const { lang, setLang } = useI18n();
  const [activeId, setActiveId] = useState(null);
  // Page « Commandes » demandée par l'URL (voir readEntry) ; consommée une fois, puis effacée de l'URL.
  const [entry, setEntry] = useState(readEntry);
  const clearEntry = useCallback(() => {
    setEntry(null);
    try { window.history.replaceState(null, '', window.location.pathname); } catch { /* sans importance */ }
  }, []);
  useEffect(() => {
    if (user && entry && !ORDERS_PAGE_BY_PORTAL[getPortalKey(user)]) clearEntry();
  }, [user, entry, clearEntry]);
  // La langue enregistrée sur le compte s'applique dès la connexion.
  useEffect(() => {
    if (!user) return;
    const saved = getSavedLang();
    if (saved && saved !== lang) setLang(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  // Incrémenté quand le serveur renvoie des déclarations différentes (ex. un collègue en a ajouté) :
  // la page courante est alors remontée pour afficher les données à jour.
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => onVigilanceError((message) => toast('warn', tr("Synchronisation"), tr(message), 'ti ti-alert-triangle')), [toast]);
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    Promise.all([hydrateVigilance(), hydrateRecords()]).then((flags) => { if (flags.some(Boolean) && !cancelled) setDataVersion((n) => n + 1); });
    return () => { cancelled = true; };
  }, [user, activeId]);
  const [lastUserKey, setLastUserKey] = useState(null);

  // Without this, activeId keeps whatever page was last open (e.g. a
  // profile page only reachable via the topbar avatar, not the
  // sidebar). Logging out doesn't unmount AuthedApp — only `user`
  // changes — so on the next login that stale id would carry over,
  // land on a page not present in the new role's NAV_CONFIG, and the
  // PageRouter's ComingSoon fallback would show until a sidebar item
  // was clicked to overwrite it.
  //
  // Resetting this during render (rather than in a useEffect) avoids
  // an extra render where the stale page would flash before
  // correcting itself — this is React's documented pattern for
  // resetting state when a value changes, not a departure from it.
  const userKey = user?.email ?? null;
  if (userKey !== lastUserKey) {
    setLastUserKey(userKey);
    // « Suivre ma commande » (lien sans offre) : le fournisseur arrive sur son suivi, pas sur le catalogue.
    const portal = userKey ? getPortalKey(user) : null;
    setActiveId(userKey && entry ? ((portal === 'supplier' && !entry.offer ? 'sup-suivi' : ORDERS_PAGE_BY_PORTAL[portal]) ?? null) : null);
  }

  // Session mode: wait for /api/auth/session (no-session users are sent to the
  // site's /login by AuthContext). The dashboards' own LoginPage only ever
  // shows in demo mode (unit tests).
  if (status === 'loading') {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--text-secondary, #8aa)' }}>{tr("Chargement…")}</div>;
  }
  if (status === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
        <div>
          <p style={{ marginBottom: 12 }}>{tr(error)}</p>
          <a href="/login" className="btn btn--primary">{tr("Retour à la connexion")}</a>
        </div>
      </div>
    );
  }
  if (!user) return <LoginPage />;

  // Looked up by portal key — see navConfig.js's getPortalKey header
  // (role/org/department refactor §7/§8).
  const currentId = activeId || DASHBOARD_ID_BY_ROLE[getPortalKey(user)] || DASHBOARD_ID_BY_ROLE[user.role];

  // CallProvider sits above the whole shell so an incoming audio/video call rings on ANY page,
  // not only on "Messages"; CallOverlay is the one global call screen.
  return (
    <CallProvider>
      {/* key={lang} : les textes sont retraduits sans perdre la session ni la page ouverte */}
      <AppLayout key={lang} activeNavId={currentId} onNavSelect={setActiveId}>
        {/* Pages chargées à la demande (une page = un petit fichier JS) : le tableau de bord s'ouvre plus vite. */}
        <Suspense fallback={<div className="page-loading" role="status" aria-live="polite" style={{ padding: '2rem', opacity: 0.7 }}>{tr('Chargement…')}</div>}>
          <PageRouter key={dataVersion} user={user} activeId={currentId} onNavigate={setActiveId} entry={entry} onEntryConsumed={clearEntry} />
        </Suspense>
      </AppLayout>
      <CallOverlay key={`call-${lang}`} />
    </CallProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider source="session">
        <ToastProvider>
          <AuthedApp />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
