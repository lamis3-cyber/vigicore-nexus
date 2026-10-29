import { useI18n } from '../../i18n/index.jsx';
import { saveField } from '../data/settingsStore';

// Sélecteur de langue réel (français / arabe) : change la langue de TOUTE l'application
// et l'enregistre sur le compte (elle est retrouvée à la prochaine connexion).
export default function LanguageSelect({ id }) {
  const { lang, setLang } = useI18n();
  return (
    <select
      id={id}
      className="form-input"
      value={lang}
      onChange={(e) => { saveField('lang', e.target.value); setLang(e.target.value); }}
    >
      <option value="fr">Français</option>
      <option value="ar">العربية</option>
      <option value="en">English</option>
    </select>
  );
}
