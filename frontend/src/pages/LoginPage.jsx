import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './login/login.css'
import { useAuth } from '../hooks/useAuth.js'
import { getSession } from '../lib/auth.js'
import useTheme from '../hooks/useTheme.js'
import useLoginScene from '../hooks/useLoginScene.js'
import { useI18n } from '../i18n/index.jsx'
import {
  checkMatch, clearErr, resendMfa, setupEnterToSubmit, setupMfaInputs, showErr,
  startMfaTimer, stopMfaTimer, syncViewHeight, toggleChk, togglePw, updateStrength,
} from '../lib/loginUi.js'
import Logo from '../components/layout/Logo.jsx'
import { AuthLayers, AuthAnchors, AuthCard } from './login/AuthScene.jsx'
import ShieldMark from '../components/layout/ShieldMark.jsx'
import CustomSelect from './login/CustomSelect.jsx'
import {
  LANG_NAMES, ORG_TYPE_LABELS, ORG_TYPES_BY_ROLE,
  PROFESSIONAL_ROLES, ROLE_OPTIONS, DEPARTMENT_EXAMPLE_BY_ROLE, getDepartmentRule, professionOptionsFor,
} from './login/constants.js'
import { tr } from '../i18n/translate.js';
import { takeOrderIntent } from '../lib/market.js'

/** Chemin interne sûr, sinon null (évite la redirection ouverte vers un site tiers). */
function safeNext(raw) {
  if (!raw || typeof raw !== 'string') return null
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null
  if (/[\u0000-\u001f]/.test(raw)) return null
  return raw
}

export default function LoginPage() {
  // ── Auth hook ────────────────────────────────────────────────────────────
  const { loading, error: authError, doLogin, doSignup, doMfa, doReset } = useAuth()

  const { lang, setLang, t, languages } = useI18n()
  const { theme, toggle: toggleTheme } = useTheme()
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef(null)
  const isRtl = lang === 'ar'

  // Animated background (canvases + connector lines), cleaned up on unmount.
  useLoginScene()

  // Language menu: close on outside click.
  useEffect(() => {
    if (!langOpen) return
    const onDown = (e) => { if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false) }
    document.addEventListener('click', onDown)
    return () => document.removeEventListener('click', onDown)
  }, [langOpen])

  // MFA digit boxes, Enter-to-submit, and the countdown timer's lifetime.
  useEffect(() => {
    const offMfa = setupMfaInputs()
    const offEnter = setupEnterToSubmit()
    return () => { offMfa(); offEnter(); stopMfaTimer() }
  }, [])

  // ── View switching (Sign In / Sign Up / Reset / MFA / Pending) ───────────
  // Driven entirely by React state.
  const VIEW_ORDER = ['login', 'signup', 'reset', 'mfa', 'pending']
  const [view, setView] = useState('login')

  const goToView = (v) => {
    setView(v)
    // The card animates its height between views of different sizes.
    requestAnimationFrame(() => syncViewHeight(VIEW_ORDER.indexOf(v)))
  }

  // ── Role dropdown state ──────────────────────────────────────────────────
  const navigate = useNavigate()
  const [roleOpen, setRoleOpen] = useState(false)
  const [roleValue, setRoleValue] = useState('')
  const triggerRef = useRef(null)
  const listRef = useRef(null)

  const toggleRoleDD = () => setRoleOpen(prev => !prev)

  const roleLabel = roleValue
    ? t(`login.role.${roleValue}`, ROLE_OPTIONS.find(r => r.value === roleValue)?.label)
    : t('login.rolePlaceholder')

  const pickRole = (value) => {
    setRoleValue(value)
    setRoleOpen(false)
    const input = document.getElementById('su-role')
    if (input) input.value = value
    if (value) {
      const errEl = document.getElementById('err-su-role')
      if (errEl) errEl.classList.remove('show')
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    if (!roleOpen) return
    const handleOutside = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        listRef.current && !listRef.current.contains(e.target)
      ) {
        setRoleOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [roleOpen])
  // ────────────────────────────────────────────────────────────────────────

  // ── Sign-Up: Professional Status / Organization / Profession state ──────
  // Role ≠ Organization ≠ Profession/Position ≠ Department (kept separate).
  const isProfessionalRole = PROFESSIONAL_ROLES.includes(roleValue)
  const [professionalStatus, setProfessionalStatus] = useState('') // '' | 'independent' | 'organization'
  const [organizationType, setOrganizationType] = useState('')
  const [profession, setProfession] = useState('')
  const deptRule = getDepartmentRule(roleValue, organizationType) // 'required' | 'optional' | 'hidden'

  // Role changed → Patient hides/clears all professional fields; a
  // professional role recalculates which Organization Type / Profession
  // are still valid and clears them if they no longer apply.
  useEffect(() => {
    if (!isProfessionalRole) {
      setProfessionalStatus('')
      setOrganizationType('')
      setProfession('')
      return
    }
    setOrganizationType(prev => {
      const allowed = ORG_TYPES_BY_ROLE[roleValue] || []
      return prev && allowed.includes(prev) ? prev : ''
    })
    setProfession(prev => {
      const allowed = professionOptionsFor(roleValue, professionalStatus).map(p => p.value)
      return prev && allowed.includes(prev) ? prev : ''
    })
  }, [roleValue, isProfessionalRole, professionalStatus])

  // Independent/Private → hide + clear Organization fields (not required,
  // never submitted as stale/fake values).
  useEffect(() => {
    if (professionalStatus !== 'organization') {
      setOrganizationType('')
    }
  }, [professionalStatus])

  // Keep the card's animated height in sync as fields dynamically
  // appear/disappear (same mechanism used elsewhere for view switching).
  useEffect(() => {
    requestAnimationFrame(() => syncViewHeight(VIEW_ORDER.indexOf('signup')))
  }, [roleValue, professionalStatus, organizationType, profession, lang])
  // ────────────────────────────────────────────────────────────────────────

  // First paint: size the card, and open the Sign Up tab when we arrive via
  // /login#signup (reached from the "Client" choice of /signup, the account-type chooser).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      syncViewHeight(0)
      document.fonts?.ready?.then(() => syncViewHeight(0))
      if (window.location.hash === '#signup') goToView('signup')
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  // Re-measure the visible view when the language changes (text length differs).
  useEffect(() => {
    const raf = requestAnimationFrame(() => syncViewHeight(VIEW_ORDER.indexOf(view)))
    return () => cancelAnimationFrame(raf)
  }, [lang, view])

  // ── Auth action handlers — wire React buttons to the hook ────────────────

  // Where to land after a successful sign-in: product-provider accounts go to their
  // services page; everybody else — including a healthcare organization admin
  // (ORG_ADMIN, 'administrator' dashboard) — to the role dashboards.
  // Si on vient d'une page (ex. une fiche produit : /login?next=/services/abc), on y retourne après la
  // connexion — jamais vers un autre site : seul un chemin interne (« /x », pas « //x » ni « /\\x ») est accepté.
  const goAfterLogin = async () => {
    // `?next=` d'abord ; sinon la commande commencée en visiteur (retenue avant l'inscription), pour rouvrir la carte de commande.
    const intent = takeOrderIntent()
    const next = safeNext(new URLSearchParams(window.location.search).get('next')) ?? safeNext(intent)
    if (next) { window.location.href = next; return }
    const session = await getSession()
    // Fabricant (ESTABLISHMENT_ADMIN) -> page Services ; tous les autres, fournisseur (FOURNISSEUR) compris -> /dashboard/
    // (le tableau de bord choisit lui-même la bonne interface selon le rôle de la session).
    const isProvider = session.ok && session.data.user?.role === 'ESTABLISHMENT_ADMIN'
    window.location.href = isProvider ? '/dashboard/services' : '/dashboard/'
  }

  const handleLogin = () => {
    const em = document.getElementById('lc-email')?.value.trim() ?? ''
    const pw = document.getElementById('lc-pass')?.value ?? ''
    // Basic client-side validation before hitting the API
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return
    if (!pw || pw.length < 8) return
    doLogin(em, pw, {
      onMfaRequired: () => {
        goToView('mfa')
        startMfaTimer(t('login.codeExpired'))
        document.getElementById('mfa0')?.focus()
      },
      onSuccess: goAfterLogin,
    })
  }

  const handleMfa = () => {
    const inputs = document.querySelectorAll('.mfa-digit')
    const code = [...inputs].map(x => x.value).join('')
    if (code.length < 6) return
    doMfa(code, {
      onSuccess: goAfterLogin,
    })
  }

  const handleSignup = () => {
    const name    = document.getElementById('su-name')?.value.trim() ?? ''
    const email   = document.getElementById('su-email')?.value.trim() ?? ''
    const role    = roleValue
    const pass    = document.getElementById('su-pass')?.value ?? ''
    const confirm = document.getElementById('su-confirm')?.value ?? ''

    let hasError = false

    if (!name) {
      showErr('su-name', 'err-su-name')
      hasError = true
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showErr('su-email', 'err-su-email')
      hasError = true
    }
    if (!role) {
      document.getElementById('err-su-role')?.classList.add('show')
      hasError = true
    }

    // Professional-only fields — validated according to the current
    // dynamic state, never for fields that are hidden.
    const payload = { name, email, role, password: pass }
    if (isProfessionalRole) {
      if (!professionalStatus) {
        showErr('su-prof-status', 'err-su-prof-status')
        hasError = true
      } else {
        payload.professionalStatus = professionalStatus

        if (professionalStatus === 'independent') {
          if (!profession) {
            showErr('su-profession', 'err-su-profession')
            hasError = true
          } else {
            payload.profession = profession
          }
        } else if (professionalStatus === 'organization') {
          const orgName = document.getElementById('su-org-name')?.value.trim() ?? ''
          const dept = document.getElementById('su-department')?.value.trim() ?? ''

          if (!organizationType) {
            showErr('su-org-type', 'err-su-org-type')
            hasError = true
          } else {
            payload.organizationType = organizationType
          }
          if (!orgName) {
            showErr('su-org-name', 'err-su-org-name')
            hasError = true
          } else {
            payload.organizationName = orgName
          }
          // Département : seulement s'il existe pour ce rôle / ce type d'établissement (jamais de valeur périmée envoyée).
          if (deptRule !== 'hidden') {
            if (!dept && deptRule === 'required') {
              showErr('su-department', 'err-su-department')
              hasError = true
            } else if (dept) {
              payload.department = dept
            }
          }
          if (!profession) {
            showErr('su-profession', 'err-su-profession')
            hasError = true
          } else {
            payload.profession = profession
          }
        }
      }
    }

    if (pass.length < 8) {
      showErr('su-pass', 'err-su-pass')
      hasError = true
    }
    if (!confirm || pass !== confirm) {
      showErr('su-confirm', 'err-su-confirm')
      hasError = true
    }
    if (hasError) return

    doSignup(payload, {
      onSuccess: (res) => {
        document.getElementById('pending-email').textContent = email
        // Compte créé, mais aucun établissement de ce type / ce nom : on le dit au lieu de laisser croire qu'une demande est partie.
        const notice = document.getElementById('pending-org-notice')
        if (notice) notice.style.display = res?.joinRequestError === 'ORG_NOT_FOUND' ? 'block' : 'none'
        goToView('pending')
      },
    })
  }

  const handleReset = () => {
    const em = document.getElementById('rst-email')?.value.trim() ?? ''
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return
    doReset(em, {
      onSuccess: () => {
        document.getElementById('rst-email-shown').textContent = em
        document.getElementById('reset-form-wrap').style.display = 'none'
        document.getElementById('reset-sent-wrap').style.display = 'block'
        syncViewHeight(2)
      },
    })
  }
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
<AuthLayers />

<nav className="login-navbar">
  <Link className="nav-logo" to="/">
    <Logo idPrefix="login-nav" />
  </Link>
  <div className="nav-center">{t('login.navCenter')}</div>
  <div className="login-nav-right">
    <div style={{'position':'relative'}} id="lang-wrap" ref={langRef}>
      <button className="nav-btn" onClick={() => setLangOpen(o => !o)} id="lang-btn" aria-label={t('login.ariaLang')} aria-expanded={langOpen} style={{'width':'42px','gap':'3px','fontSize':'10px','letterSpacing':'.06em'}}>
        <span id="lang-label">{lang.toUpperCase()}</span>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div id="lang-menu" style={{'display': langOpen ? 'block' : 'none','position':'absolute','top':'calc(100% + 6px)','right':'0','background':'rgba(2,10,22,.96)','border':'1px solid rgba(0,232,255,.22)','borderRadius':'8px','overflow':'hidden','minWidth':'80px','boxShadow':'0 8px 32px rgba(0,0,0,.6)','zIndex':'200','backdropFilter':'blur(16px)'}}>
        {languages.map(({ code, label }) => (
          <button key={code} onClick={() => { setLang(code); setLangOpen(false) }} className={`lang-opt${lang === code ? ' active' : ''}`} id={`opt-${label}`}>
            {tr(label)} <span style={{'opacity':'.45','fontSize':'9px'}}>{LANG_NAMES[code]}</span>
          </button>
        ))}
      </div>
    </div>
    <button className="nav-btn" onClick={toggleTheme} id="theme-btn" aria-label={t('login.ariaTheme')} title={t(theme === 'light' ? 'login.themeToDark' : 'login.themeToLight')}>
      <svg id="icon-sun" width="14" height="14" style={{'display': theme === 'light' ? '' : 'none'}} viewBox="0 0 24 24" fill="none" stroke="rgba(200,140,0,0.9)" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
      <svg id="icon-moon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{'display': theme === 'light' ? 'none' : ''}}>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </button>
    <div className="nav-sep"></div>
    <Link to="/" className="nav-main-site">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      {t('login.navMain')}
    </Link>
  </div>
</nav>

<main className="page">
  <div className="system" id="system">
    <canvas id="lines-c"></canvas>
    <AuthAnchors />

    
    <AuthCard className={`lc${isRtl ? ' lc-rtl' : ''}`}>

      


      
      
      <div className={`lc-tabs${view === 'signup' ? ' on-signup' : ''}`} id="lc-tabs" style={{'display': ['reset','mfa','pending'].includes(view) ? 'none' : 'flex'}}>
        <button className={`lc-tab${view === 'login' ? ' active' : ''}`} onClick={() => goToView('login')} id="tab-login">{t('login.tabSignIn')}</button>
        <button className={`lc-tab${view === 'signup' ? ' active' : ''}`} onClick={() => { if (view !== 'signup') navigate('/signup') }} id="tab-signup">{t('login.tabSignUp')}</button>
        <div className="lc-tab-slider" id="tab-slider"></div>
      </div>

      
      <div className="lc-view-wrap">
      <div className="lc-views-track" id="views-track" style={{transform: `translateX(-${100 * VIEW_ORDER.indexOf(view)}%)`}}>

      
      <div className="lc-view active" id="view-login">
      <div className="lc-sh">
        <ShieldMark idPrefix="lc" className="" width={40} height={46} />
      </div>

      <div className="lc-title">{t('login.title')}</div>
      <div className="lc-sub">{t('login.sub')}</div>

      <div className="lc-f">
        <label className="lc-lab" htmlFor="lc-email"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>{t('login.labelId')}</label>
        <div className="lc-iw">
          <input className="lc-inp" type="email" id="lc-email" autoComplete="off" placeholder={t('login.phId')} onInput={() => clearErr('lc-email','err-email')}/>
        </div>
        <div className="lc-err" id="err-email">{t('login.err.emailAddr')}</div>
      </div>

      <div className="lc-f">
        <label className="lc-lab" htmlFor="lc-pass"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>{t('login.password')}</label>
        <div className="lc-iw">
          <input className="lc-inp" type="password" id="lc-pass" autoComplete="new-password" placeholder="••••••••••" onInput={() => { clearErr('lc-pass','err-pass'); updateStrength('lc-pass','pw-strength') }}/>
          <span className="lc-ico click" id="pw-tog" onClick={() => togglePw()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePw() } }} tabIndex="0" role="button" aria-label={t('login.ariaPw')}>
            <svg id="eye-ico" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </span>
        </div>
        <div className="lc-err" id="err-pass">{t('login.err.passEmpty')}</div>
      </div>

      <div className="lc-row">
        <label className="lc-cr" onClick={() => toggleChk()} tabIndex="0" role="checkbox" aria-checked="false" id="chklab">
          <div className="lc-chk" id="lc-chk"><div className="lc-tk" id="lc-tk"></div></div>
          <span className="lc-cl">{t('login.remember')}</span>
        </label>
        <button className="lc-rst" onClick={() => handleReset()}>{t('login.reset')}</button>
      </div>
      <div className="lc-session-hint" id="session-hint">{t('login.sessionHint')}</div>

      {authError && <div className="lc-err show" style={{marginBottom:'8px',display:'block'}}>{authError}</div>}
      <button className="lc-cta" id="auth-btn" onClick={handleLogin} disabled={loading}>
        <div className="lc-shim"></div><div className="lc-prog" id="auth-prog"></div>
        <div className="lc-ctxt" id="auth-txt">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
          {t('login.signIn')}
        </div>
      </button>

      <div className="lc-rate" id="rate-warn"></div>

      
      <div className="lc-foot">
        <div className="lc-ftxt">{t('login.noAccess')} <a href="mailto:contact@vigicore.health">{t('login.reqAcc')}</a></div>
      </div>
      </div>

      
      <div className="lc-view" id="view-signup">
        <div className="lc-sh" style={{'marginBottom':'8px'}}>
          <ShieldMark idPrefix="su" className="" width={52} height={60} />
      </div>
        <div className="lc-title" style={{'fontSize':'clamp(14px,1.6vw,18px)'}}>{t('login.createAccount')}</div>
        <div className="lc-sub">{t('login.suSub')}</div>

        
        <div className="lc-section"><span>{t('login.personalInfo')}</span></div>

        <div className="lc-f">
          <label className="lc-lab" htmlFor="su-name"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> {t('login.suName')}</label>
          <div className="lc-iw"><input className="lc-inp" type="text" id="su-name" placeholder={t('login.phName')} onInput={() => clearErr('su-name','err-su-name')}/></div>
          <div className="lc-err" id="err-su-name">{t('login.err.name')}</div>
        </div>
        
        <div className="lc-f lc-f--full">
          <label className="lc-lab" htmlFor="su-email"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,6 12,13 22,6"/></svg> {roleValue === 'patient' ? tr('E-mail') : t('login.suEmail')}</label>
          <div className="lc-iw"><input className="lc-inp" type="email" id="su-email" placeholder={roleValue === 'patient' ? tr("vous@exemple.com") : tr("you@institution.dz")} onInput={() => clearErr('su-email','err-su-email')}/></div>
          <div className="lc-err" id="err-su-email">{t('login.err.email')}</div>
        </div>
        
        <div className="lc-f">
          <label className="lc-lab" htmlFor="su-role"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> {t('login.suRole')}</label>
          
          <div className="cd-wrap" id="cd-wrap">
            <button
              type="button"
              ref={triggerRef}
              className={`cd-trigger${roleOpen ? ' open' : ''}${roleValue ? ' has-value' : ''}`}
              id="cd-trigger"
              onClick={toggleRoleDD}
              aria-haspopup="listbox"
              aria-expanded={roleOpen}
            >
              <span className="cd-label" id="cd-label">{roleLabel}</span>
              <svg className="cd-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <ul
              ref={listRef}
              className={`cd-list${roleOpen ? ' open' : ''}`}
              id="cd-list"
              role="listbox"
            >
              {ROLE_OPTIONS.map(({ value, label }) => (
                <li
                  key={value}
                  className={`cd-opt${roleValue === value ? ' selected' : ''}`}
                  data-value={value}
                  onClick={() => pickRole(value)}
                  role="option"
                  aria-selected={roleValue === value}
                >
                  {t(`login.role.${value}`, label)}
                </li>
              ))}
              {/* Not a personal role: opens the separate healthcare-organization sign-up. */}
              <li
                className="cd-opt"
                role="option"
                aria-selected={false}
                onClick={() => navigate('/register-healthcare')}
                style={{ borderTop: '1px solid rgba(0,232,255,.18)', color: 'var(--cyan, #00e8ff)' }}
              >
                {tr("Healthcare Establishment →")}
              </li>
            </ul>
            <input type="hidden" id="su-role" value={roleValue} readOnly/>
          </div>
          <div className="lc-err" id="err-su-role">{t('login.err.role')}</div>
        </div>

        {isProfessionalRole && (
        <div className="lc-section"><span>{t('login.professionalDetails')}</span></div>
        )}

        {isProfessionalRole && (
        <div className="lc-f">
          <label className="lc-lab" htmlFor="su-prof-status"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> {t('login.profStatus')}</label>
          <CustomSelect
            id="su-prof-status"
            value={professionalStatus}
            onChange={(v) => { setProfessionalStatus(v); clearErr('su-prof-status', 'err-su-prof-status') }}
            placeholder={t('login.select')}
            options={[
              { value: 'independent', label: t('login.independent') },
              { value: 'organization', label: t('login.workInOrg') },
            ]}
          />
          <div className="lc-err" id="err-su-prof-status">{t('login.err.profStatus')}</div>
        </div>
        )}

        {isProfessionalRole && professionalStatus === 'organization' && (
        <div className="lc-f">
          <label className="lc-lab" htmlFor="su-org-type"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4"/><path d="M8 6h1M8 10h1M8 14h1M15 6h1M15 10h1M15 14h1"/></svg> {t('login.orgType')}</label>
          <CustomSelect
            id="su-org-type"
            value={organizationType}
            onChange={(v) => { setOrganizationType(v); clearErr('su-org-type', 'err-su-org-type') }}
            placeholder={t('login.select')}
            options={(ORG_TYPES_BY_ROLE[roleValue] || []).map((type) => ({ value: type, label: t(`login.org.${type}`, ORG_TYPE_LABELS[type]) }))}
          />
          <div className="lc-err" id="err-su-org-type">{t('login.err.orgType')}</div>
        </div>
        )}

        {isProfessionalRole && professionalStatus === 'organization' && organizationType && (
        <>
        <div className="lc-f">
          <label className="lc-lab" htmlFor="su-org-name"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4"/><path d="M8 6h1M8 10h1M8 14h1M15 6h1M15 10h1M15 14h1"/></svg> {t('login.orgName')}</label>
          <div className="lc-iw"><input className="lc-inp" type="text" id="su-org-name" placeholder={t('login.phOrgName')} onInput={() => clearErr('su-org-name', 'err-su-org-name')}/></div>
          <div className="lc-err" id="err-su-org-name">{t('login.err.orgName')}</div>
        </div>

        {deptRule !== 'hidden' && (
        <div className="lc-f" key={`dept-${roleValue}-${organizationType}`}>
          <label className={`lc-lab${deptRule === 'optional' ? ' lc-lab--opt' : ''}`} htmlFor="su-department"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> {t('login.department')}{deptRule === 'optional' ? ` (${tr('facultatif')})` : ''}</label>
          <div className="lc-iw"><input className="lc-inp" type="text" id="su-department" placeholder={DEPARTMENT_EXAMPLE_BY_ROLE[roleValue] ? tr(DEPARTMENT_EXAMPLE_BY_ROLE[roleValue]) : t('login.phDepartment')} onInput={() => clearErr('su-department', 'err-su-department')}/></div>
          <div className="lc-err" id="err-su-department">{t('login.err.department')}</div>
        </div>
        )}
        </>
        )}

        {isProfessionalRole && (professionalStatus === 'independent' || (professionalStatus === 'organization' && organizationType)) && (
        <div className="lc-f">
          <label className="lc-lab" htmlFor="su-profession"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg> {t('login.profession')}</label>
          <CustomSelect
            id="su-profession"
            value={profession}
            onChange={(v) => { setProfession(v); clearErr('su-profession', 'err-su-profession') }}
            placeholder={t('login.select')}
            options={professionOptionsFor(roleValue, professionalStatus).map((o) => ({ ...o, label: t(`login.prof.${o.value}`, o.label) }))}
          />
          <div className="lc-err" id="err-su-profession">{t('login.err.profession')}</div>
        </div>
        )}

        <div className="lc-section"><span>{t('login.security')}</span></div>

        {/* Mot de passe + confirmation : côte à côte (deux champs courts), l'e-mail au-dessus occupe toute la largeur */}
        <div className="lc-pair">
          <div className="lc-f">
            <label className="lc-lab" htmlFor="su-pass"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> {t('login.password')}</label>
            <div className="lc-iw"><input className="lc-inp" type="password" id="su-pass" placeholder={t('login.phPassword')} onInput={() => { checkMatch(t('login.pwMatch'), t('login.pwNoMatch')); updateStrength('su-pass', 'su-strength'); clearErr('su-pass','err-su-pass') }}/></div>
            <div className="pw-strength-track"><div className="pw-strength" id="su-strength"></div></div>
            <div className="lc-err" id="err-su-pass">{t('login.err.passMin')}</div>
          </div>
        
          <div className="lc-f">
            <label className="lc-lab" htmlFor="su-confirm"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> {t('login.suConfirm')}</label>
            <div className="lc-iw"><input className="lc-inp" type="password" id="su-confirm" placeholder={t('login.phConfirm')} onInput={() => { checkMatch(t('login.pwMatch'), t('login.pwNoMatch')); clearErr('su-confirm','err-su-confirm') }}/></div>
            <div className="lc-match" id="su-match"></div>
            <div className="lc-err" id="err-su-confirm">{t('login.err.mismatch')}</div>
          </div>
        </div>

        {authError && <div className="lc-err show" style={{marginBottom:'8px',display:'block'}}>{authError}</div>}
        <button className="lc-cta" onClick={handleSignup} style={{'marginTop':'4px'}} disabled={loading}>
          <div className="lc-shim"></div>
          <div className="lc-prog" id="su-prog"></div>
          <div className="lc-ctxt" id="su-txt">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            {t('login.createAccount')}
          </div>
        </button>
        <div className="lc-foot" style={{'marginTop':'8px'}}>
          <div className="lc-ftxt" style={{'fontSize':'9px','color':'rgba(175,225,245,.25)'}}>{t('login.suPolicy')}</div>
        </div>
        <div className="lc-foot" style={{'marginTop':'6px'}}>
          <div className="lc-ftxt" style={{'fontSize':'10px'}}>
            {tr("Registering a hospital, clinic or medical centre?")} <Link to="/register-healthcare">{tr("Create your healthcare organization")}</Link>
          </div>
        </div>
      </div>

      
      <div className="lc-view" id="view-reset">
        <button className="lc-back" onClick={() => goToView('login')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          {t('login.rstBack')}
        </button>
        <div className="lc-title" style={{'fontSize':'clamp(14px,1.6vw,17px)'}}>{t('login.rstTitle')}</div>
        <div className="lc-sub">{t('login.rstSub')}</div>
        <div id="reset-form-wrap">
          <div className="lc-f" style={{'marginTop':'14px'}}>
            <label className="lc-lab" htmlFor="rst-email"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,6 12,13 22,6"/></svg> {t('login.rstLabel')}</label>
            <div className="lc-iw"><input className="lc-inp" type="email" id="rst-email" placeholder={tr("you@institution.dz")} onInput={() => clearErr('rst-email','err-rst-email')}/></div>
            <div className="lc-err" id="err-rst-email">{t('login.err.email')}</div>
          </div>
          <button className="lc-cta" onClick={handleReset} style={{'marginTop':'4px'}} disabled={loading}>
            <div className="lc-shim"></div>
            <div className="lc-prog" id="rst-prog"></div>
            <div className="lc-ctxt" id="rst-txt">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
              {t('login.rstBtn')}
            </div>
          </button>
        </div>
        <div id="reset-sent-wrap" style={{'display':'none'}} className="reset-sent">
          <div className="reset-sent-icon">📬</div>
          <div className="reset-sent-title">{t('login.rstSentTitle')}</div>
          <div className="reset-sent-sub">{t('login.rstSentTo')}<br/><strong id="rst-email-shown" style={{'color':'rgba(0,232,255,.7)'}}></strong><br/>{t('login.rstValid')}</div>
          <button className="lc-back" onClick={() => goToView('login')} style={{'margin':'14px auto 0','justifyContent':'center'}}>{t('login.back')}</button>
        </div>
      </div>

      
      <div className="lc-view" id="view-mfa">
        <div className="lc-sh" style={{'marginBottom':'8px'}}>
          <ShieldMark idPrefix="mfa" className="" width={52} height={60} />
      </div>
        <div className="lc-title" style={{'fontSize':'clamp(14px,1.6vw,18px)'}}>{t('login.mfaTitle')}</div>
        <div className="lc-sub">{t('login.mfaSub')}</div>
        <div className="mfa-timer" id="mfa-timer">{t('login.mfaTimer')} <span id="mfa-count">05:00</span></div>
        <div className="mfa-wrap">
          <input className="mfa-digit" type="text" maxLength="1" id="mfa0" inputMode="numeric" pattern="[0-9]" autoComplete="one-time-code"/>
          <input className="mfa-digit" type="text" maxLength="1" id="mfa1" inputMode="numeric" pattern="[0-9]"/>
          <input className="mfa-digit" type="text" maxLength="1" id="mfa2" inputMode="numeric" pattern="[0-9]"/>
          <input className="mfa-digit" type="text" maxLength="1" id="mfa3" inputMode="numeric" pattern="[0-9]"/>
          <input className="mfa-digit" type="text" maxLength="1" id="mfa4" inputMode="numeric" pattern="[0-9]"/>
          <input className="mfa-digit" type="text" maxLength="1" id="mfa5" inputMode="numeric" pattern="[0-9]"/>
        </div>
        <div className="lc-err" id="err-mfa" style={{'textAlign':'center','marginBottom':'8px'}}></div>
        <button className="lc-cta" onClick={handleMfa} id="mfa-btn" disabled={loading}>
          <div className="lc-shim"></div>
          <div className="lc-prog" id="mfa-prog"></div>
          <div className="lc-ctxt" id="mfa-txt">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            {t('login.mfaBtn')}
          </div>
        </button>
        <button className="mfa-resend" onClick={() => resendMfa(t('login.codeResent'))} id="mfa-resend-btn">{t('login.mfaResend')}</button>
        <button className="lc-back" onClick={() => goToView('login')} style={{'margin':'8px auto 0','justifyContent':'center'}}>{t('login.back')}</button>
      </div>

      
      <div className="lc-view" id="view-pending">
        <div className="lc-pending">
          <div className="pending-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(0,200,120,.85)" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div className="pending-title">{t('login.pendingTitle')}</div>
          <div className="pending-sub">
            {t('login.pendingSub').split('\n').map((line, i) => (
              <React.Fragment key={i}>{i > 0 && <br/>}{line}</React.Fragment>
            ))}
          </div>
          <div className="pending-email" id="pending-email"></div>
          <div className="pending-sub" id="pending-org-notice" style={{'display':'none','marginTop':'8px','color':'#f5b942'}}>{tr("Aucun établissement de ce type avec ce nom n'a été trouvé : aucune demande d'adhésion n'a été envoyée. Vous pourrez le chercher depuis « Mon organisation ».")}</div>
          <div className="pending-sub" style={{'marginTop':'4px'}}>{t('login.pendingAvg')} <strong style={{'color':'rgba(0,232,255,.6)'}}>{t('login.pendingTime')}</strong></div>
          <button className="lc-back" onClick={() => goToView('login')} style={{'margin':'12px auto 0','justifyContent':'center'}}>{t('login.back')}</button>
        </div>
      </div>

      </div>
      </div>

      </AuthCard>
  </div>
</main>


    </>
  )
}