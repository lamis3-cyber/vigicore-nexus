import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.jsx'
import './styles/index.css'
import './effects/offscreenPause.js' // marks off-screen sections so their animations pause
import './effects/scrollState.js' // pauses the ambient canvases + blurs while the user scrolls
import './effects/fitScreen.js' // scales a section down if it is still taller than the screen
import { I18nProvider } from './i18n/index.jsx'
import NotFound from './pages/NotFound.jsx'

// Weak machines (<= 4 cores or <= 4 GB RAM) get the lite mode: background canvas at ~15 fps, lighter 3D.
if (typeof window !== 'undefined' && window.__vgLite === undefined) {
  window.__vgLite = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4
}

// Lazy-loaded: keeps the login / dashboard pages out of the initial bundle so
// the public landing page (Hero, Why, Solution...) loads faster.
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'))
const AboutPage = lazy(() => import('./pages/AboutPage.jsx'))
const ServicesPage = lazy(() => import('./pages/ServicesPage.jsx'))
const ServiceDetailPage = lazy(() => import('./pages/ServiceDetailPage.jsx'))
const ManageServicesPage = lazy(() => import('./pages/ManageServicesPage.jsx'))
const InvoicePage = lazy(() => import('./pages/InvoicePage.jsx'))
const AdminPaymentsPage = lazy(() => import('./pages/AdminPaymentsPage.jsx'))
const AdminHomePage = lazy(() => import('./pages/AdminHomePage.jsx'))
const AdminProductsPage = lazy(() => import('./pages/AdminProductsPage.jsx'))
const AdminBuyersPage = lazy(() => import('./pages/AdminBuyersPage.jsx'))
const LegalPage = lazy(() => import('./pages/LegalPage.jsx'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.jsx'))
const RegisterOrganizationPage = lazy(() => import('./pages/RegisterOrganizationPage.jsx'))
const SignupChoicePage = lazy(() => import('./pages/SignupChoicePage.jsx'))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/login" element={
          <Suspense fallback={null}>
            <LoginPage />
          </Suspense>
        } />
        <Route path="/about" element={
          <Suspense fallback={null}>
            <AboutPage />
          </Suspense>
        } />
        <Route path="/services" element={
          <Suspense fallback={null}>
            <ServicesPage />
          </Suspense>
        } />
        {/* Fiche produit : détails, « Commander » (demande sans paiement), « J'aime », « Contacter ». */}
        <Route path="/services/:id" element={
          <Suspense fallback={null}>
            <ServiceDetailPage />
          </Suspense>
        } />
        {/* /dashboard/ itself is NOT a route of this SPA: it is a separate page
            (dashboard/index.html -> src/dashboards/) with the role dashboards,
            reached with a normal page load right after login. Only the
            services / invoice sub-pages below still live in this SPA. */}
        <Route path="/dashboard/services" element={
          <Suspense fallback={null}>
            <ManageServicesPage />
          </Suspense>
        } />
        <Route path="/dashboard/invoice/:orderId" element={
          <Suspense fallback={null}>
            <InvoicePage />
          </Suspense>
        } />
        {/* VigiCore staff only — the API enforces it (PLATFORM_ADMIN_EMAILS); the page just shows the 403. */}
        <Route path="/admin" element={
          <Suspense fallback={null}>
            <AdminHomePage />
          </Suspense>
        } />
        <Route path="/admin/products" element={
          <Suspense fallback={null}>
            <AdminProductsPage />
          </Suspense>
        } />
        <Route path="/admin/payments" element={
          <Suspense fallback={null}>
            <AdminPaymentsPage />
          </Suspense>
        } />
        {/* VigiCore staff only — vérification des catégories d'acheteurs (commandes aux fabricants). */}
        <Route path="/admin/buyers" element={
          <Suspense fallback={null}>
            <AdminBuyersPage />
          </Suspense>
        } />
        {/* Dedicated PRODUCT-PROVIDER sign-up (manufacturer / supplier listing products
            on /services) — separate from /login's client sign-up and from the
            healthcare organization sign-up (/register-healthcare). */}
        <Route path="/register-organization" element={
          <Suspense fallback={null}>
            <RegisterOrganizationPage />
          </Suspense>
        } />
        {/* Distributor / wholesale supplier (buys from manufacturers; verified by VigiCore staff before ordering). */}
        <Route path="/register-supplier" element={
          <Suspense fallback={null}>
            <RegisterOrganizationPage kind="supplier" />
          </Suspense>
        } />
        <Route path="/register-supplier-staff" element={
          <Suspense fallback={null}>
            <RegisterOrganizationPage kind="supplier-staff" />
          </Suspense>
        } />
        {/* Healthcare organization admin (hospital / clinic / medical centre) —
            same page, different account kind: NOT the product-provider flow above. */}
        <Route path="/register-healthcare" element={
          <Suspense fallback={null}>
            <RegisterOrganizationPage kind="healthcare" />
          </Suspense>
        } />
        {/* "Problem", "Platform" and "Contact" are sections on the homepage,
            not separate pages — these routes exist so that direct links/typed
            URLs to them (e.g. shared externally, or bookmarked) land on the
            right section instead of hitting the 404 page. */}
        <Route path="/legal" element={<Suspense fallback={null}><LegalPage kind="legal" /></Suspense>} />
        <Route path="/privacy" element={<Suspense fallback={null}><LegalPage kind="privacy" /></Suspense>} />
        <Route path="/terms" element={<Suspense fallback={null}><LegalPage kind="terms" /></Suspense>} />
        <Route path="/reset-password" element={<Suspense fallback={null}><ResetPasswordPage /></Suspense>} />
        <Route path="/problem" element={<Navigate to="/#zoom-section" replace />} />
        <Route path="/platform" element={<Navigate to="/#platform-section" replace />} />
        <Route path="/contact" element={<Navigate to="/#contact-form" replace />} />
        {/* Sign-up entry point: "Client or Seller?" first. A client continues in the Sign Up tab of /login
            (/login#signup, unchanged); a seller picks Manufacturer or Distributor. */}
        <Route path="/signup" element={<Suspense fallback={null}><SignupChoicePage /></Suspense>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>,
)
