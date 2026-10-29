import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { tr, localeTag } from '../../i18n/translate.js';

// Replaces aiChatPanel / docAIChatPanel / pharmAIChatPanel / hospAIChatPanel /
// clinAIChatPanel / cmAIChatPanel — 6 copy-pasted blocks in the original HTML.
// One component, config passed in per role (see AI_CHAT_CONFIG).
function formatTime(date) {
  return date.toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' });
}

export default function ChatPanel({
  open,
  onClose,
  title,
  greetingName,
  description,
  disclaimer,
  suggestions = [],
  messages,
  isTyping = false,
  onSend,
  onNewChat,
  conversations = [],
  activeConversationId = null,
  onOpenConversation,
  onDeleteConversation,
}) {
  const [showHistory, setShowHistory] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll to the latest message (or the typing indicator) whenever
  // the conversation grows.
  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [open, messages, isTyping]);

  // Auto-grow the textarea up to the CSS-defined max-height (100px), then
  // let it scroll internally.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  if (!open) return null;

  const send = (text) => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setDraft('');
  };

  const submit = (e) => {
    e.preventDefault();
    send(draft);
  };

  const handleKeyDown = (e) => {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  };

  // Only offer quick-start suggestions before the conversation has started —
  // once the user is chatting, the chips would just be noise.
  const showSuggestions = suggestions.length > 0 && messages.length === 0 && !isTyping;

  return (
    <>
      <div className="chat-overlay is-open" onClick={onClose} />
      <div className="chat-panel overlay-modal is-open" role="dialog" aria-modal="true" aria-labelledby="chatPanelTitle">
        <div className="chat-header">
          <div className="chat-header-inner">
            <div className="chat-avatar"><Icon name="sparkles" /></div>
            <div>
              <div id="chatPanelTitle" className="u-fs13-strong">{tr(title)}</div>
              <div className="u-t19"><span className="live-dot" />{tr("En ligne")}</div>
            </div>
            {onOpenConversation && (
              <button
                type="button"
                className="chat-close chat-new"
                style={{ marginInlineStart: 'auto', flexShrink: 0 }}
                onClick={() => setShowHistory((v) => !v)}
                aria-pressed={showHistory}
                title={tr("Historique")}
                aria-label={tr("Historique")}
              >
                <Icon name="history" />
              </button>
            )}
            <button
              type="button"
              className="chat-close chat-new"
              style={{ marginInlineStart: onOpenConversation ? 8 : 'auto', width: 'auto', padding: '0 10px', gap: 6, fontSize: 12, whiteSpace: 'nowrap' }}
              onClick={() => { setShowHistory(false); onNewChat(); }}
              disabled={messages.length === 0 && !isTyping && !activeConversationId}
              title={tr("Nouvelle discussion")}
              aria-label={tr("Nouvelle discussion")}
            >
              <Icon name="plus" />{tr("Nouvelle discussion")}
            </button>
            <button className="chat-close" style={{ marginInlineStart: 8 }} onClick={onClose} aria-label={tr("Fermer l'assistant IA")}>
              <Icon name="x" />
            </button>
          </div>
        </div>

        {showHistory && (
          <div className="chat-messages" role="list" aria-label={tr("Historique")}>
            {conversations.length === 0 && <p className="u-fs-12 u-c-tertiary">{tr("Aucune discussion enregistrée.")}</p>}
            {conversations.map((c) => (
              <div key={c.id} role="listitem" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="chat-suggestion"
                  style={{ flex: 1, textAlign: 'start', ...(c.id === activeConversationId ? { borderColor: 'var(--color-cyan)' } : {}) }}
                  onClick={() => { setShowHistory(false); onOpenConversation(c.id); }}
                >
                  <span style={{ display: 'block' }}>{c.title}</span>
                  <span className="u-fs10-5-tertiary">{new Date(c.updatedAt).toLocaleString(localeTag(), { dateStyle: 'short', timeStyle: 'short' })}</span>
                </button>
                <button type="button" className="chat-close" onClick={() => onDeleteConversation(c.id)} title={tr("Supprimer cette discussion")} aria-label={tr("Supprimer cette discussion")}>
                  <Icon name="trash" />
                </button>
              </div>
            ))}
          </div>
        )}

        {!showHistory && <div className="chat-messages">
          <div className="chat-greeting-card">
            <div className="chat-greeting-name">{tr("Bonjour {0} —", [greetingName])}</div>
            <p className="chat-greeting-text">{tr(description)}</p>
            {disclaimer && <p className="chat-greeting-disclaimer">{tr(disclaimer)}</p>}
          </div>

          {messages.map((m, i) => (
            <div className={`chat-message chat-message--${m.from}`} key={i}>
              <div className="chat-bubble" style={{ whiteSpace: "pre-line" }}>{tr(m.text)}</div>
              <span className="chat-timestamp">{formatTime(m.ts)}</span>
            </div>
          ))}
          {isTyping && (
            <div className="chat-message chat-message--ai" aria-live="polite">
              <div className="chat-bubble chat-bubble--typing">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>}

        {showSuggestions && (
          <div className="chat-suggestions">
            {suggestions.map((s) => (
              <button type="button" className="chat-suggestion" key={s} onClick={() => send(tr(s))}>
                {tr(s)}
              </button>
            ))}
          </div>
        )}

        <div className="chat-input-area">
          <form className="chat-input-row" onSubmit={submit}>
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={tr("Posez une question à votre assistant santé...")}
            />
            <button type="submit" className="chat-send" aria-label={tr("Envoyer")} disabled={!draft.trim()}>
              <Icon name="send" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
