import { useRef, useState } from 'react';
import Icon from './Icon';
import { useToast } from '../context/ToastContext';
import { tr } from '../../i18n/translate.js';

// File picker + list used by the "Preuves" step of the declaration wizards.
// Files are chosen and listed here; the wizard sends them (uploadAttachments) to the CNPM by e-mail
// once the declaration is saved.
const sizeLabel = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

export const fileKey = (f) => `${f.name}|${f.size}`;

export default function EvidenceUpload({
  files,
  onChange,
  notes,
  onNoteChange,
  allowedExt = ['pdf', 'jpg', 'jpeg', 'png'],
  maxSize = 10 * 1024 * 1024,
  maxFiles = 10,
}) {
  const toast = useToast();
  const input = useRef(null);
  const [over, setOver] = useState(false);

  function add(list) {
    const next = [];
    for (const f of Array.from(list || [])) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!allowedExt.includes(ext)) { toast('error', tr("Format refusé"), tr("{0} : formats acceptés {1}.", [f.name, allowedExt.map((e) => e.toUpperCase()).join(', ')]), 'ti ti-alert-triangle'); continue; }
      if (f.size > maxSize) { toast('error', tr("Fichier trop volumineux"), tr("{0} dépasse {1} Mo.", [f.name, Math.round(maxSize / 1048576)]), 'ti ti-alert-triangle'); continue; }
      next.push(f);
    }
    if (next.length) onChange([...files, ...next].slice(0, maxFiles));
  }

  return (
    <>
      <input ref={input} type="file" multiple accept={allowedExt.map((e) => `.${e}`).join(',')} hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <div
        className={`dw-drop${over ? ' is-over' : ''}`}
        role="button" tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
      >
        <Icon name="paperclip" />
        <div>{tr("Glissez vos fichiers ici ou cliquez pour parcourir")}</div>
        <small>{tr("{0} · {1} Mo max par fichier · {2} fichiers max", [allowedExt.map((e) => e.toUpperCase()).join(', '), Math.round(maxSize / 1048576), maxFiles])}</small>
      </div>
      {files.length > 0 && (
        <ul className="dw-files">
          {files.map((f, i) => (
            <li className="dw-file" key={`${f.name}-${i}`}>
              <span>{tr(f.name)}<small>{sizeLabel(f.size)}</small></span>
              {onNoteChange && (
                <input
                  className="form-input" style={{ flex: 1, minWidth: 120, fontSize: 12 }} maxLength={120}
                  placeholder={tr("Description (facultatif)")} aria-label={tr("Description de {0}", [f.name])}
                  value={notes?.[fileKey(f)] || ''} onChange={(e) => onNoteChange(fileKey(f), e.target.value)}
                />
              )}
              <button type="button" aria-label={tr("Retirer {0}", [f.name])} onClick={() => onChange(files.filter((_, j) => j !== i))}><Icon name="x" /></button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
