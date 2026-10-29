import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import './login/login.css'
import { signup } from '../lib/auth.js'
import useTheme from '../hooks/useTheme.js'
import useLoginScene from '../hooks/useLoginScene.js'
import { togglePw, updateStrength } from '../lib/loginUi.js'
import Logo from '../components/layout/Logo.jsx'
import { AuthLayers, AuthAnchors, AuthCard } from './login/AuthScene.jsx'
import CustomSelect from './login/CustomSelect.jsx'
import { ORG_TYPE_LABELS } from './login/constants.js'
import { tr } from '../i18n/translate.js';

// Three different organization accounts share this page (same look, different identity):
//   kind="supplier"   /register-supplier         -> role fournisseur
//                     a wholesale supplier / distributor that BUYS from manufacturers: company sheet
//                     (RC, NIF, phone, address, optional approval number), then verified by VigiCore staff
//                     before it can order. Lands on its own supplier dashboard.
//   kind="provider"   /register-organization  -> role establishment_admin
//                     a manufacturer / supplier that lists products on /services
//                     (server always stores it as a SUPPLIER establishment).
//   kind="healthcare" /register-healthcare     -> role org_admin
//                     first administrator of a hospital / clinic / medical centre:
//                     lands on the 'administrator' dashboard, then approves
//                     join requests and sends invitations to the staff.
const HEALTHCARE_TYPES = ['hospital', 'clinic', 'medical_centre']

const COPY = {
  provider: {
    title: 'List Your Products',
    sub: 'For manufacturers, importers & suppliers: create your company account to list your products in Services',
    nameLabel: 'Company Name',
    namePh: 'e.g. MedSupply Algérie',
    emailPh: 'you@company.dz',
    cta: 'Create Company Account',
    links: [
      { to: '/register-supplier', text: 'Wholesale supplier or distributor? Register here' },
      { to: '/register-healthcare', text: 'Register a hospital, clinic or medical centre instead' },
    ],
  },
  supplier: {
    title: 'Create Your Distributor Account',
    sub: 'For wholesale suppliers and distributors: register your company. VigiCore verifies it before you can order from manufacturers',
    nameLabel: 'Company Name',
    namePh: 'e.g. MedSupply Distribution',
    emailPh: 'you@company.dz',
    cta: 'Create Distributor Account',
    links: [
      { to: '/register-organization', text: 'Manufacturer listing products? Register here' },
    ],
  },
  // Employé d'un fournisseur : aucune société créée ; l'administrateur de son entreprise l'invite avec cette adresse e-mail.
  'supplier-staff': {
    title: 'Join Your Company’s Team',
    sub: 'For employees of a distributor or wholesale supplier. Your administrator invites you with this e-mail address; you then accept the invitation in the Team page',
    nameLabel: 'Company Name',
    namePh: '',
    emailPh: 'you@company.dz',
    cta: 'Create Employee Account',
    links: [
      { to: '/register-supplier', text: 'Registering your own distributor company? Register here' },
    ],
  },
  healthcare: {
    title: 'Create Your Healthcare Organization',
    sub: 'Register your hospital, clinic or medical centre and manage your team',
    nameLabel: 'Organization Name',
    namePh: 'e.g. Clinique El Amel',
    emailPh: 'you@organization.dz',
    cta: 'Create Organization Account',
    links: [
      { to: '/signup', text: 'Selling products? Choose your seller account type' },
    ],
  },
}

const EMPTY = {
  rcNumber: '',
  nifNumber: '',
  phone: '',
  address: '',
  declaredApprovalNumber: '',
  organizationType: '',
  organizationName: '',
  adminName: '',
  email: '',
  password: '',
  confirm: '',
}

// One plain text field of the company sheet (same markup / classes as the other fields of this card).
function SheetField({ id, label, ph, value, error, onChange, type = 'text' }) {
  return (
    <div className="lc-f">
      <label className="lc-lab" htmlFor={id}>{tr(label)}</label>
      <div className="lc-iw">
        <input
          className={`lc-inp${error ? ' invalid' : ''}`}
          id={id}
          type={type}
          placeholder={tr(ph)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <div className={`lc-err${error ? ' show' : ''}`}>{error ? tr(error) : ''}</div>
    </div>
  )
}

/**
 * /register-organization — full visual parity with /login (same
 * login.css + login-navbar + animated canvas background + "lc" card +
 * shield mark + icon-labeled fields + trust strip + compliance badges).
 * It shares LoginPage's background animation (useLoginScene) and the
 * password eye-toggle / strength meter (lib/loginUi.js). Those look the
 * field up by id, so the primary password input keeps #lc-pass / #pw-tog.
 *
 * Deliberately still a SEPARATE route from /login (see the footer links)
 * — same look, different action: this is where an org admin registers
 * their establishment, not where a client signs in/up.
 */
export default function RegisterOrganizationPage({ kind = 'provider' }) {
  const copy = COPY[kind]
  const isHealthcare = kind === 'healthcare'
  const isSupplier = kind === 'supplier'
  const isStaff = kind === 'supplier-staff' // employee: no company sheet, no company name
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle') // idle | saving
  const [serverError, setServerError] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const { toggle: toggleTheme } = useTheme()
  useLoginScene()

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  function validate() {
    const next = {}
    if (isHealthcare && !form.organizationType) next.organizationType = 'Select the type of organization'
    if (!isStaff && !form.organizationName.trim()) next.organizationName = 'Enter your organization\u2019s name'
    if (!form.adminName.trim()) next.adminName = 'Enter your full name'
    if (isSupplier) {
      // Same rules as the API (backend lib/supplierRules.ts): the server is the one that really decides.
      const idOk = (v, min, max) => v.length >= min && v.length <= max && /^[\p{L}\p{N}][\p{L}\p{N} /._\-°'’#]*$/u.test(v)
      const rc = form.rcNumber.trim(), nif = form.nifNumber.trim(), ph = form.phone.trim(), ad = form.address.trim(), ag = form.declaredApprovalNumber.trim()
      if (!idOk(rc, 5, 40)) next.rcNumber = 'Enter your commercial register (RC) number'
      if (!idOk(nif, 8, 25)) next.nifNumber = 'Enter your tax identification number (NIF)'
      if (!/^\+?[0-9][0-9 ().\-/]{6,24}$/.test(ph)) next.phone = 'Enter a valid phone number'
      if (ad.length < 5 || ad.length > 240) next.address = 'Enter your company address'
      if (ag && !idOk(ag, 1, 60)) next.declaredApprovalNumber = 'Approval number is invalid'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email'
    if (form.password.length < 8) next.password = 'Password must be at least 8 characters'
    if (form.confirm !== form.password) next.confirm = 'Passwords don\u2019t match'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError(null)
    if (!validate()) return

    setStatus("saving")
    const result = await signup({
      name: form.adminName,
      email: form.email,
      role: isHealthcare ? 'org_admin' : isSupplier ? 'fournisseur' : isStaff ? 'fournisseur_staff' : 'establishment_admin',
      password: form.password,
      ...(isStaff ? {} : { organizationName: form.organizationName.trim() }),
      ...(isHealthcare ? { organizationType: form.organizationType } : {}),
      ...(isSupplier ? {
        rcNumber: form.rcNumber.trim(),
        nifNumber: form.nifNumber.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        ...(form.declaredApprovalNumber.trim() ? { declaredApprovalNumber: form.declaredApprovalNumber.trim() } : {}),
      } : {}),
    })
    setStatus("idle")

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    // Manufacturer (provider) -> its services page; healthcare admin and distributor -> the role dashboards
    // ('administrator' / 'supplier'); the distributor sees its "pending verification" banner there.
    window.location.href = isHealthcare || isSupplier || isStaff ? '/dashboard/' : '/dashboard/services'
  }

  return (
    <>
      <AuthLayers />

      <nav className="login-navbar">
        <Link className="nav-logo" to="/">
          <Logo idPrefix="orgnav" />
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
              <style>{"#login-card .lc-f-row2 { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:0 16px; margin-bottom:10px; } #login-card .lc-f-row2 > .lc-f { display:contents; } #login-card .lc-f-row2 > .lc-f:nth-child(odd) > * { grid-column:1; min-width:0; } #login-card .lc-f-row2 > .lc-f:nth-child(even) > * { grid-column:2; min-width:0; } #login-card .lc-f-row2 .lc-lab { grid-row:1; align-self:end; } #login-card .lc-f-row2 .lc-iw { grid-row:2; } #login-card .lc-f-row2 .lc-err { grid-row:3; } #login-card .lc-f-row2 .lc-match, #login-card .lc-f-row2 .pw-strength-track { grid-row:4; } #login-card .lc-f { margin-bottom:10px; } #login-card .lc-lab { margin-bottom:6px; } #login-card .lc-sh svg { width:32px; height:37px; } #login-card .lc-sh { margin-bottom:2px; } #login-card .lc-title { margin-bottom:2px; } #login-card .lc-sub { margin-bottom:24px; } #login-card .lc-bdg { white-space:nowrap; } #login-card .lc-foot { flex-wrap:wrap; gap:6px 10px; }"}</style>

              <div className="lc-sh">
                <svg width="40" height="46" viewBox="0 0 210 245" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="orgsh-sg1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#001a2e"/>
                      <stop offset="100%" stopColor="#000d1a"/>
                    </linearGradient>
                    <linearGradient id="orgsh-sg-edge" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.9"/>
                      <stop offset="50%" stopColor="#00ffc8" stopOpacity="0.6"/>
                      <stop offset="100%" stopColor="#0a7aff" stopOpacity="0.8"/>
                    </linearGradient>
                    <filter id="orgsh-shield-glow">
                      <feGaussianBlur stdDeviation="3" result="b"/>
                      <feComposite in="SourceGraphic" in2="b" operator="over"/>
                    </filter>
                  </defs>
                  <path d="M105,4 L200,40 L200,120 Q200,188 105,238 Q10,188 10,120 L10,40 Z" fill="none" stroke="rgba(0,229,255,0.12)" strokeWidth="4"/>
                  <path d="M105,8 L196,43 L196,119 Q196,183 105,233 Q14,183 14,119 L14,43 Z" fill="none" stroke="url(#orgsh-sg-edge)" strokeWidth="1.8" filter="url(#orgsh-shield-glow)"/>
                  <path d="M105,18 L186,50 L186,120 Q186,176 105,222 Q24,176 24,120 L24,50 Z" fill="none" stroke="rgba(0,229,255,0.22)" strokeWidth="1.2"/>
                  <path d="M105,30 L174,58 L174,120 Q174,168 105,210 Q36,168 36,120 L36,58 Z" fill="none" stroke="rgba(0,229,255,0.14)" strokeWidth="1"/>
                  <path d="M105,8 L195,42 L195,118 Q195,182 105,232 Q15,182 15,118 L15,42 Z" fill="url(#orgsh-sg1)" opacity="0.95"/>
                  <text x="105" y="130" textAnchor="middle" dominantBaseline="middle" fontFamily="'Rajdhani', sans-serif" fontSize="52" fontWeight="700" fill="rgba(0,229,255,0.75)" letterSpacing="2">VN</text>
                </svg>
              </div>

              <div className="lc-title">{tr(copy.title)}</div>
              <div className="lc-sub">{tr(copy.sub)}</div>

              <form onSubmit={handleSubmit} noValidate>
                {isHealthcare && (
                  <div className="lc-f">
                    <label className="lc-lab" htmlFor="org-type">{tr("Organization Type")}</label>
                    <CustomSelect
                      id="org-type"
                      value={form.organizationType}
                      onChange={(v) => set('organizationType', v)}
                      placeholder="Select…"
                      invalid={!!errors.organizationType}
                      options={HEALTHCARE_TYPES.map((v) => ({ value: v, label: ORG_TYPE_LABELS[v] }))}
                    />
                    <div className={`lc-err${errors.organizationType ? ' show' : ''}`}>{errors.organizationType}</div>
                  </div>
                )}
                <div className="lc-f-row2">
                {!isStaff && (
                <div className="lc-f">
                  <label className="lc-lab" htmlFor="org-name"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1"/></svg>{copy.nameLabel}</label>
                  <div className="lc-iw">
                    <input
                      className={`lc-inp${errors.organizationName ? ' invalid' : ''}`}
                      id="org-name"
                      type="text"
                      placeholder={copy.namePh}
                      value={form.organizationName}
                      onChange={(e) => set('organizationName', e.target.value)}
                    />
                  </div>
                  <div className={`lc-err${errors.organizationName ? ' show' : ''}`}>{errors.organizationName}</div>
                </div>
                )}

                <div className="lc-f">
                  <label className="lc-lab" htmlFor="admin-name"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>{tr("Your Full Name")}</label>
                  <div className="lc-iw">
                    <input
                      className={`lc-inp${errors.adminName ? ' invalid' : ''}`}
                      id="admin-name"
                      type="text"
                      placeholder={tr("Firstname Lastname")}
                      value={form.adminName}
                      onChange={(e) => set('adminName', e.target.value)}
                    />
                  </div>
                  <div className={`lc-err${errors.adminName ? ' show' : ''}`}>{errors.adminName}</div>
                </div>
                </div>

                {isSupplier && (
                  <>
                    <div className="lc-f-row2">
                      <SheetField id="sup-rc" label="Commercial Register (RC)" ph="e.g. 19/00-0012345 B 19" value={form.rcNumber} error={errors.rcNumber} onChange={(v) => set('rcNumber', v)} />
                      <SheetField id="sup-nif" label="Tax ID (NIF)" ph="e.g. 001919001234567" value={form.nifNumber} error={errors.nifNumber} onChange={(v) => set('nifNumber', v)} />
                    </div>
                    <div className="lc-f-row2">
                      <SheetField id="sup-phone" label="Phone" ph="+213 …" type="tel" value={form.phone} error={errors.phone} onChange={(v) => set('phone', v)} />
                      <SheetField id="sup-agr" label="Approval Number (optional)" ph="e.g. AGR-2024/117" value={form.declaredApprovalNumber} error={errors.declaredApprovalNumber} onChange={(v) => set('declaredApprovalNumber', v)} />
                    </div>
                    <SheetField id="sup-addr" label="Company Address" ph="Street, city" value={form.address} error={errors.address} onChange={(v) => set('address', v)} />
                  </>
                )}
                <div className="lc-f">
                  <label className="lc-lab" htmlFor="admin-email"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>{tr("Work Email")}</label>
                  <div className="lc-iw">
                    <input
                      className={`lc-inp${errors.email ? ' invalid' : ''}`}
                      id="admin-email"
                      type="email"
                      autoComplete="username"
                      placeholder={copy.emailPh}
                      value={form.email}
                      onChange={(e) => set('email', e.target.value)}
                    />
                    <span className="lc-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,6 12,13 22,6"/></svg></span>
                  </div>
                  <div className={`lc-err${errors.email ? ' show' : ''}`}>{errors.email}</div>
                </div>

                {/* Mot de passe + confirmation côte à côte ; l'e-mail au-dessus occupe toute la largeur */}
                <div className="lc-f-row2">
                  <div className="lc-f">
                    <label className="lc-lab" htmlFor="lc-pass"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>{tr("Password")}</label>
                    <div className="lc-iw">
                      <input
                        className={`lc-inp${errors.password ? ' invalid' : ''}`}
                        id="lc-pass"
                        type="password"
                        autoComplete="new-password"
                        value={form.password}
                        onChange={(e) => { set('password', e.target.value); updateStrength('lc-pass', 'pw-strength') }}
                      />
                      <span className="lc-ico click" id="pw-tog" onClick={() => togglePw()} tabIndex="0" role="button" aria-label={tr("Show/hide password")}>
                        <svg id="eye-ico" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </span>
                    </div>
                    <div className={`lc-err${errors.password ? ' show' : ''}`}>{errors.password}</div>
                    <div className="pw-strength-track"><div className="pw-strength" id="pw-strength"></div></div>
                  </div>

                  <div className="lc-f">
                    <label className="lc-lab" htmlFor="admin-confirm"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>{tr("Confirm Password")}</label>
                    <div className="lc-iw">
                      <input
                        className={`lc-inp${errors.confirm ? ' invalid' : ''}`}
                        id="admin-confirm"
                        type={showConfirm ? 'text' : 'password'}
                        value={form.confirm}
                        onChange={(e) => set('confirm', e.target.value)}
                      />
                      <span className="lc-ico click" onClick={() => setShowConfirm((v) => !v)} tabIndex="0" role="button" aria-label={tr("Show/hide password")}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={showConfirm ? '#00e8ff' : 'currentColor'} strokeWidth="1.5" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </span>
                    </div>
                    <div className={`lc-err${errors.confirm ? ' show' : ''}`}>{errors.confirm}</div>
                  </div>
                </div>


                {serverError && <div className="lc-err show" style={{marginBottom:'8px',display:'block'}}>{serverError}</div>}

                <button className="lc-cta" type="submit" disabled={status === 'saving'}>
                  <div className="lc-shim"></div>
                  <div className="lc-prog"></div>
                  <div className="lc-ctxt">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                    {status === 'saving' ? tr("Creating…") : tr(copy.cta)}
                  </div>
                </button>
              </form>

              <div className="lc-foot">
                <div className="lc-ftxt">{tr("Already registered?")} <Link to="/login">{tr("Log in")}</Link><br/>{tr("Reporting an incident, not selling products?")} <Link to="/login#signup">{tr("Sign up as a client")}</Link>{copy.links.map((l) => (<React.Fragment key={l.to}><br/><Link to={l.to}>{tr(l.text)}</Link></React.Fragment>))}</div>
                <div className="lc-bdgs"><span className="lc-bdg">{tr("ANPP")}</span><span className="lc-bdg">{tr("ISO 13485")}</span><span className="lc-bdg">{tr("CNPM")}</span></div>
              </div>

            </AuthCard>
        </div>
      </main>
    </>
  )
}
