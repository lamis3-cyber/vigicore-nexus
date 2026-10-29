import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './login/login.css'
import useTheme from '../hooks/useTheme.js'
import useLoginScene from '../hooks/useLoginScene.js'
import Logo from '../components/layout/Logo.jsx'
import { AuthLayers, AuthAnchors, AuthCard } from './login/AuthScene.jsx'
import { tr } from '../i18n/translate.js'

// /signup — « Quel type de compte ? » : la porte d'entrée unique de l'inscription.
//   1) Client (patient, médecin, pharmacien, labo, personnel…)  -> /login#signup  (formulaire existant, inchangé)
//   2) Vendeur -> Fabricant   (publie ses fiches produits)       -> /register-organization
//             -> Fournisseur  (distributeur / grossiste, achète) -> /register-supplier
// Cette page ne crée rien et ne décide d'aucun rôle : elle oriente seulement vers le bon formulaire. Le rôle
// réellement attribué est celui que le serveur accepte à l'inscription.

const OPTION_CSS = `
#login-card .sc-list { display:flex; flex-direction:column; gap:10px; margin:6px 0 14px; }
#login-card .sc-opt { display:flex; align-items:flex-start; gap:12px; width:100%; text-align:start; cursor:pointer; padding:14px 16px; border-radius:12px; color:inherit; font:inherit;
  background:rgba(0,229,255,.06); border:1px solid rgba(0,229,255,.28); transition:background .15s, border-color .15s, transform .15s; }
#login-card .sc-opt:hover, #login-card .sc-opt:focus-visible { background:rgba(0,229,255,.12); border-color:rgba(0,229,255,.6); transform:translateY(-1px); outline:none; }
#login-card .sc-opt-title { font-weight:700; font-size:15px; margin-bottom:3px; }
#login-card .sc-opt-desc { font-size:12.5px; opacity:.78; line-height:1.45; }
#login-card .sc-ico { flex:0 0 auto; width:34px; height:34px; border-radius:9px; display:grid; place-items:center; background:rgba(0,229,255,.14); color:#00e5ff; }
#login-card .sc-back { background:none; border:0; color:inherit; opacity:.75; cursor:pointer; font:inherit; font-size:12.5px; padding:0; margin-bottom:10px; }
#login-card .sc-back:hover { opacity:1; text-decoration:underline; }
`

const ICONS = {
  client: <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  seller: <path d="M3 9l1-5h16l1 5M3 9v11h18V9M3 9h18M9 20v-6h6v6" />,
  maker: <path d="M3 21h18M5 21V8l5 3V8l5 3V4h4v17" />,
  supplier: <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />,
}

function Option({ icon, title, desc, onClick }) {
  return (
    <button type="button" className="sc-opt" onClick={onClick}>
      <span className="sc-ico">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[icon]}</svg>
      </span>
      <span>
        <div className="sc-opt-title">{tr(title)}</div>
        <div className="sc-opt-desc">{tr(desc)}</div>
      </span>
    </button>
  )
}

export default function SignupChoicePage() {
  const [step, setStep] = useState('type') // 'type' (Client / Vendeur) | 'seller' (Fabricant / Fournisseur)
  const navigate = useNavigate()
  const { toggle: toggleTheme } = useTheme()
  useLoginScene()

  return (
    <>
      <AuthLayers />

      <nav className="login-navbar">
        <Link className="nav-logo" to="/">
          <Logo idPrefix="choicenav" />
        </Link>
        <div className="nav-center">{tr("VigiCore NEXUS Portal")}</div>
        <div className="login-nav-right">
          <button className="nav-btn" onClick={toggleTheme} aria-label={tr("Toggle theme")} title={tr("Switch theme")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
          <div className="nav-sep"></div>
          <Link to="/" className="nav-main-site">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            {tr("Main Site")}
          </Link>
        </div>
      </nav>

      <main className="page">
        <div className="system" id="system">
          <canvas id="lines-c"></canvas>
          <AuthAnchors />

          <AuthCard className="lc">
            <style>{OPTION_CSS}</style>

            {step === 'type' ? (
              <>
                <div className="lc-title">{tr("Create your account")}</div>
                <div className="lc-sub">{tr("Are you a client or a seller?")}</div>
                <div className="sc-list">
                  <Option icon="client" title="Client" desc="Patient, doctor, pharmacist, laboratory or medical staff: report incidents and follow your files" onClick={() => navigate('/login#signup')} />
                  <Option icon="seller" title="Seller" desc="You make or distribute health products and sell them to healthcare establishments" onClick={() => setStep('seller')} />
                </div>
              </>
            ) : (
              <>
                <button type="button" className="sc-back" onClick={() => setStep('type')}>← {tr("Back")}</button>
                <div className="lc-title">{tr("What kind of seller are you?")}</div>
                <div className="lc-sub">{tr("Manufacturers publish their products; distributors buy from manufacturers")}</div>
                <div className="sc-list">
                  <Option icon="maker" title="Manufacturer" desc="You make products and list them in Services so establishments can order from you" onClick={() => navigate('/register-organization')} />
                  <Option icon="supplier" title="Distributor / wholesale supplier" desc="You buy from manufacturers to supply establishments. Your company is verified by VigiCore before you can order" onClick={() => navigate('/register-supplier')} />
                  <Option icon="client" title="Employee of a distributor" desc="Your company already has an account: create yours, then accept your administrator's invitation to join the team" onClick={() => navigate('/register-supplier-staff')} />
                </div>
              </>
            )}

            <div className="lc-foot">
              <div className="lc-ftxt">{tr("Already registered?")} <Link to="/login">{tr("Log in")}</Link><br/><Link to="/register-healthcare">{tr("Register a hospital, clinic or medical centre instead")}</Link></div>
              <div className="lc-bdgs"><span className="lc-bdg">{tr("ANPP")}</span><span className="lc-bdg">{tr("ISO 13485")}</span><span className="lc-bdg">{tr("CNPM")}</span></div>
            </div>
          </AuthCard>
        </div>
      </main>
    </>
  )
}
