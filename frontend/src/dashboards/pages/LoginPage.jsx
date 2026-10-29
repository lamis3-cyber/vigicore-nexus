import { useState } from 'react';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { tr } from '../../i18n/translate.js';

export default function LoginPage() {
  const { login, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    login(email, password);
  }

  return (
    <div id="loginScreen">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-icon">
            <Icon name="shield-check" />
          </div>
          <div>
            <div className="login-brand-name">
              {tr("VigiCore")}<span style={{ color: 'var(--color-cyan)' }}>{tr("Dz")}</span>
            </div>
            <div className="login-brand-sub">{tr("Nexus · Écosystème de vigilance")}</div>
          </div>
        </div>

        <div className="login-title">{tr("Connexion")}</div>
        <div className="login-sub">{tr("Accédez à votre espace de travail vigilance.")}</div>

        {error && (
          <div className="login-error">
            <Icon name="alert-circle" />
            <span>{tr(error)}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="loginEmail">{tr("Adresse e-mail professionnelle")}</label>
            <input
              id="loginEmail"
              className="form-input"
              type="email"
              autoComplete="username"
              placeholder={tr("vous@organisation.dz")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="loginPassword">{tr("Mot de passe")}</label>
            <input
              id="loginPassword"
              className="form-input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn--primary" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>
            <Icon name="login-2" />
            {tr("Se connecter")}
          </button>
        </form>
      </div>
    </div>
  );
}
