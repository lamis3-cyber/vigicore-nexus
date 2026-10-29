import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { tr } from '../../i18n/translate.js';

const ToastContext = createContext(null);

// Ported 1:1 from the original's TOAST_ICONS / TOAST_COLORS.
const TOAST_ICONS = { success: 'circle-check', info: 'info-circle', warn: 'alert-circle', error: 'alert-triangle' };
const TOAST_COLORS = { success: 'var(--color-green)', info: 'var(--color-cyan)', warn: 'var(--color-amber)', error: 'var(--color-red)' };

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const removeToast = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  // Same signature as the original global toast(type, title, msg, iconClass).
  const toast = useCallback((type, title, msg, iconClass) => {
    const id = nextId++;
    setToasts((list) => [...list, { id, type, title, msg, iconClass }]);
    // Original: 4.5s display + .4s fade-out. We just remove after 4.5s —
    // the fade is handled by the .toast CSS `animation: toast-in` on enter;
    // exit fade is skipped in favor of the close button / simple removal.
    timers.current[id] = setTimeout(() => removeToast(id), 4500);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container" role="log" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <div className="toast-icon">
              <Icon name={t.iconClass || TOAST_ICONS[t.type]} style={{ color: TOAST_COLORS[t.type], fontSize: '18px' }} />
            </div>
            <div>
              <div className="toast-title">{tr(t.title)}</div>
              <div className="toast-msg">{tr(t.msg)}</div>
            </div>
            <button className="toast-close" onClick={() => removeToast(t.id)} aria-label={tr("Fermer")}>
              <Icon name="x" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
