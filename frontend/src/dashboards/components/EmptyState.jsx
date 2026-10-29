import Icon from './Icon';
import { tr } from '../../i18n/translate.js';

/**
 * Empty / "all clear" / unavailable state, used by every list page.
 *  - icon / title / text: what to show; keep `title` short, `text` one sentence.
 *  - tone "ok"      : good news (no alert, nothing to do) -> green icon.
 *    tone "neutral" : just nothing here yet -> grey icon.
 *  - variant "unavailable": data retrieval is not connected to a backend yet.
 *  - bare: render without its own card, for use INSIDE an existing card.
 *  - action (optional): { label, onClick, icon } — only pass it when the target exists.
 * Styles live in styles/polish.css (.empty-state*).
 */
export default function EmptyState({ icon = 'inbox', title, text, variant = 'empty', tone = 'neutral', action, bare = false }) {
  return (
    <div className={`empty-state${bare ? ' empty-state--bare' : ''}`} role="status">
      <div className={`empty-state-icon empty-state-icon--${tone}`}><Icon name={icon} /></div>
      <div className="empty-state-title">{tr(title)}</div>
      {text && <div className="empty-state-text">{tr(text)}</div>}
      {variant === 'unavailable' && <div className="empty-state-note">{tr("Non connecté au serveur pour le moment.")}</div>}
      {action && (
        <button className="btn btn--primary empty-state-action" onClick={action.onClick}>
          {action.icon && <Icon name={action.icon} />}{tr(action.label)}
        </button>
      )}
    </div>
  );
}
