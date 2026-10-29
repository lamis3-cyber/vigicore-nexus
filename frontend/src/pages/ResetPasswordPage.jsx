import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { confirmPasswordReset } from '../lib/auth.js'
import { tr } from '../i18n/translate.js';

// Landing page of the link e-mailed by POST /api/auth/password-reset (token in ?token=, single use, 30 min).
export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [state, setState] = useState({ status: 'idle', msg: '' })

  const submit = async (e) => {
    e.preventDefault()
    if (pw.length < 8) return setState({ status: 'error', msg: 'Le mot de passe doit contenir au moins 8 caractères.' })
    if (pw !== pw2) return setState({ status: 'error', msg: 'Les deux mots de passe ne correspondent pas.' })
    setState({ status: 'sending', msg: '' })
    const r = await confirmPasswordReset(token, pw)
    setState(r.ok ? { status: 'done', msg: '' } : { status: 'error', msg: r.error })
  }
  const box = { minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg, #00131f)', color: 'var(--white, #eaf6ff)', fontFamily: "'Inter', sans-serif", padding: 24 }
  const input = { width: '100%', padding: '12px 14px', margin: '6px 0 14px', borderRadius: 8, border: '1px solid rgba(0,229,255,.35)', background: 'rgba(0,0,0,.25)', color: 'inherit' }
  return (
    <div style={box}>
      <form onSubmit={submit} style={{ width: 'min(420px, 100%)' }}>
        <h1 style={{ fontFamily: "'Rajdhani', sans-serif" }}>{tr("Nouveau mot de passe")}</h1>
        {!token ? <p>{tr("Lien invalide.")} <Link to="/login">{tr("Demander un nouveau lien")}</Link></p>
          : state.status === 'done' ? <p role="status">{tr("Mot de passe modifié. Toutes vos sessions ont été fermées.")} <Link to="/login">{tr("Se connecter")}</Link></p>
          : (<>
            <label>{tr("Nouveau mot de passe")}<input style={input} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required /></label>
            <label>{tr("Confirmer")}<input style={input} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={8} required /></label>
            {state.status === 'error' && <p role="alert" style={{ color: '#ff8a80' }}>{tr(state.msg)} {' '}<Link to="/login">{tr("Demander un nouveau lien")}</Link></p>}
            <button type="submit" disabled={state.status === 'sending'} style={{ padding: '12px 28px', borderRadius: 8, border: '1px solid var(--cyan, #00e5ff)', background: 'transparent', color: 'var(--cyan, #00e5ff)', cursor: 'pointer' }}>
              {state.status === 'sending' ? tr("Enregistrement…") : tr("Enregistrer")}
            </button>
          </>)}
      </form>
    </div>
  )
}
