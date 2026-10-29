import { useState } from 'react';
import Icon from './Icon';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { accountApi } from '../services/accountApi';
import './account-security.css';
import { tr } from '../../i18n/translate.js';

const MIN_LENGTH = 8;

// One account-security card for every role (patient, doctor, pharmacist,
// laboratory, medical staff, auditor, hospital / clinic / medical centre admins):
//  1. change the password — the current one is re-checked on the server;
//  2. deactivate the account — a soft deactivation: the sign-in is closed but the
//     declarations and their audit trail stay, as vigilance records must be kept.
export default function AccountSecurity() {
  const toast = useToast();
  const { logout } = useAuth();

  // ── change password ──
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canChange = !!current && next.length >= MIN_LENGTH && confirm === next && !pwBusy;

  async function changePassword(e) {
    e.preventDefault();
    if (!canChange) return;
    setPwBusy(true);
    setPwError('');
    const res = await accountApi.changePassword(current, next);
    setPwBusy(false);
    if (!res.ok) { setPwError(res.error); return; }
    setCurrent(''); setNext(''); setConfirm('');
    toast('success', tr("Mot de passe modifié"), tr("Utilisez-le à votre prochaine connexion."), 'ti ti-key');
  }

  // ── deactivate ──
  const [open, setOpen] = useState(false);
  const [dePassword, setDePassword] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [deBusy, setDeBusy] = useState(false);
  const [deError, setDeError] = useState('');

  function cancelDeactivate() { setOpen(false); setDePassword(''); setUnderstood(false); setDeError(''); }

  async function deactivate(e) {
    e.preventDefault();
    if (!dePassword || !understood || deBusy) return;
    setDeBusy(true);
    setDeError('');
    const res = await accountApi.deactivate(dePassword);
    setDeBusy(false);
    if (!res.ok) { setDeError(res.error); return; }
    toast('info', tr("Compte désactivé"), tr("Vous allez être déconnecté."), 'ti ti-user-off');
    logout();
  }

  return (
    <div className="card acs" id="account-security">
      <div className="section-header">
        <h2 className="section-title"><Icon name="shield-lock" className="u-c-brand" />{tr("Mot de passe & compte")}</h2>
      </div>

      {/* Change password */}
      <form className="acs-block" onSubmit={changePassword} noValidate>
        <h3 className="acs-title">{tr("Modifier le mot de passe")}</h3>
        <p className="acs-sub">{tr("Saisissez votre mot de passe actuel puis choisissez-en un nouveau ({0} caractères minimum).", [MIN_LENGTH])}</p>
        <div className="acs-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="acsCurrent">{tr("Mot de passe actuel")}</label>
            <input id="acsCurrent" className="form-input" type="password" autoComplete="current-password"
              value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="acsNew">{tr("Nouveau mot de passe")}</label>
            <input id="acsNew" className="form-input" type="password" autoComplete="new-password"
              value={next} onChange={(e) => setNext(e.target.value)} />
            <div className={`acs-hint${tooShort ? ' is-bad' : next.length >= MIN_LENGTH ? ' is-ok' : ''}`}>
              {next.length >= MIN_LENGTH ? tr("Longueur suffisante") : tr("{0} caractères minimum", [MIN_LENGTH])}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="acsConfirm">{tr("Confirmer le nouveau mot de passe")}</label>
            <input id="acsConfirm" className="form-input" type="password" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {mismatch && <div className="acs-hint is-bad">{tr("Les deux mots de passe ne correspondent pas")}</div>}
          </div>
        </div>
        {pwError && <p className="acs-error" role="alert">{pwError}</p>}
        <div className="acs-actions">
          <button type="submit" className="btn btn--primary" disabled={!canChange}>
            <Icon name="key" />{pwBusy ? tr("Mise à jour…") : tr("Mettre à jour le mot de passe")}
          </button>
        </div>
      </form>

      {/* Deactivate */}
      <div className="acs-block">
        <div className="acs-danger">
          <h3 className="acs-title">{tr("Désactiver mon compte")}</h3>
          <p className="acs-sub" style={{ marginBottom: open ? 0 : 12 }}>
            {tr("Vous ne pourrez plus vous connecter. Vos déclarations et leur historique sont conservés (traçabilité de la vigilance) ; seul un administrateur peut réactiver le compte.")}
          </p>
          {!open ? (
            <button type="button" className="btn btn--danger" onClick={() => setOpen(true)}>
              <Icon name="user-off" />{tr("Désactiver mon compte")}
            </button>
          ) : (
            <form className="acs-confirm" onSubmit={deactivate} noValidate>
              <div className="form-group" style={{ maxWidth: 320 }}>
                <label className="form-label" htmlFor="acsDePw">{tr("Confirmez avec votre mot de passe")}</label>
                <input id="acsDePw" className="form-input" type="password" autoComplete="current-password"
                  value={dePassword} onChange={(e) => setDePassword(e.target.value)} />
              </div>
              <label className="acs-check">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                <span>{tr("Je comprends que je serai déconnecté et que je ne pourrai plus accéder à mon compte sans un administrateur.")}</span>
              </label>
              {deError && <p className="acs-error" role="alert">{deError}</p>}
              <div className="acs-actions">
                <button type="submit" className="btn btn--danger" disabled={!dePassword || !understood || deBusy}>
                  <Icon name="user-off" />{deBusy ? tr("Désactivation…") : tr("Confirmer la désactivation")}
                </button>
                <button type="button" className="btn" onClick={cancelDeactivate} disabled={deBusy}>{tr("Annuler")}</button>
              </div>
            </form>
          )}
        </div>
        <p className="acs-note">
          {tr("La suppression définitive des données n'est pas disponible depuis l'application : les déclarations de vigilance doivent être conservées. Pour toute demande de suppression, contactez l'administrateur.")}
        </p>
      </div>
    </div>
  );
}
