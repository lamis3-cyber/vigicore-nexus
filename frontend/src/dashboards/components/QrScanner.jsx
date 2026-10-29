import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import jsQR from 'jsqr';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import Icon from './Icon';
import { parseScan } from '../lib/parseScan';
import { tr } from '../../i18n/translate.js';

// ═══════════════════════════════════════════════════════════════
// Real camera scanner for QR / DataMatrix / barcodes (all roles).
//  1. Native BarcodeDetector when the browser has it (Chrome/Android,
//     macOS, Safari 17+ …).
//  2. Otherwise zxing-cpp compiled to WebAssembly (zxing-wasm): reads
//     QR, DataMatrix, Code128/39/93, EAN/UPC, ITF, Codabar, DataBar —
//     much more robust than a JS decoder on blurry webcam frames.
//  3. jsQR (QR only) if the WebAssembly module cannot be loaded.
//  4. "Scan from a photo" fallback when the camera is unavailable or
//     blocked (HTTP page, permission denied, no camera…).
// NOTE: browsers only expose the camera on HTTPS or localhost.
// ═══════════════════════════════════════════════════════════════

const FORMATS = ['qr_code', 'data_matrix', 'code_128', 'code_39', 'code_93', 'codabar', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf'];
const WASM_FORMATS = ['QRCode', 'DataMatrix', 'Code128', 'Code39', 'Code93', 'Codabar', 'EANUPC', 'ITF', 'DataBar'];

let readerPromise = null;
function loadReader() {
  if (!readerPromise) {
    readerPromise = import('zxing-wasm/reader')
      .then(async (m) => {
        await m.prepareZXingModule({
          overrides: { locateFile: (p, prefix) => (p.endsWith('.wasm') ? wasmUrl : prefix + p) },
          fireImmediately: true,
        });
        return m.readBarcodes;
      })
      .catch(() => null);
  }
  return readerPromise;
}

async function wasmDecode(canvas) {
  const readBarcodes = await loadReader();
  if (!readBarcodes) return { text: null, available: false };
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const res = await readBarcodes(img, {
      formats: WASM_FORMATS,
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      tryDownscale: true,
      maxNumberOfSymbols: 1,
    });
    return { text: res?.[0]?.text || null, available: true };
  } catch {
    return { text: null, available: true };
  }
}

// full pipeline for ONE canvas (frame or photo): wasm first, jsQR as backup
async function decodeWithFallbacks(canvas) {
  const { text, available } = await wasmDecode(canvas);
  if (text) return text;
  if (available) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return qr?.data || null;
}

function errorMessage(err) {
  if (!window.isSecureContext) {
    return "La caméra n'est accessible qu'en HTTPS (ou localhost). Ouvrez le site en https:// ou utilisez « Scanner une photo ».";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "Ce navigateur ne permet pas l'accès à la caméra. Utilisez « Scanner une photo ».";
  }
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return "Accès à la caméra refusé. Autorisez la caméra dans les réglages du navigateur (icône cadenas), puis réessayez.";
    case 'NotFoundError':
    case 'OverconstrainedError':
      return "Aucune caméra détectée sur cet appareil. Utilisez « Scanner une photo ».";
    case 'NotReadableError':
      return "La caméra est utilisée par une autre application. Fermez-la puis réessayez.";
    default:
      return "Impossible d'ouvrir la caméra. Utilisez « Scanner une photo » ou saisissez le lot manuellement.";
  }
}

export default function QrScanner({ open, onClose, onDetected, validate, title = 'Scanner le QR / DataMatrix' }) {
  const cbRef = useRef({});
  cbRef.current = { onDetected, validate };
  const rejectedRef = useRef({ text: '', t: 0 });
  const errTimer = useRef(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const doneRef = useRef(false);
  const detectorRef = useRef(null);
  const fileRef = useRef(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('starting'); // starting | scanning | error
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const finish = useCallback((text) => {
    if (doneRef.current || !text) return;
    const parsed = parseScan(text);
    const problem = cbRef.current.validate?.(parsed);
    if (problem) {
      // not a product code (URL, phone…) → keep scanning, tell the user why
      const now = Date.now();
      if (rejectedRef.current.text === text && now - rejectedRef.current.t < 2500) return;
      rejectedRef.current = { text, t: now };
      setError(problem);
      clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setError(''), 4500);
      return;
    }
    doneRef.current = true;
    stop();
    if (navigator.vibrate) { try { navigator.vibrate(60); } catch { /* ignore */ } }
    cbRef.current.onDetected?.(parsed);
  }, [stop]);

  // decode a canvas (photo upload or fallback path)
  const decodeCanvas = useCallback(async (canvas) => {
    if (detectorRef.current) {
      try {
        const found = await detectorRef.current.detect(canvas);
        if (found?.length) return found[0].rawValue;
      } catch { /* continue */ }
    }
    return decodeWithFallbacks(canvas);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    doneRef.current = false;
    setError('');
    setStatus("starting");
    let cancelled = false;

    (async () => {
      // native detector (optional)
      try {
        if ('BarcodeDetector' in window) {
          const supported = await window.BarcodeDetector.getSupportedFormats();
          const formats = FORMATS.filter((f) => supported.includes(f));
          if (formats.length) detectorRef.current = new window.BarcodeDetector({ formats });
        }
      } catch { detectorRef.current = null; }

      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) { setError(errorMessage()); setStatus("error"); }
        return;
      }

      try {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          });
        } catch (e) {
          if (e?.name === 'OverconstrainedError') {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          } else { throw e; }
        }
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();
        // sharper close-ups when the camera supports it (ignored otherwise)
        try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* not supported */ }
        loadReader(); // warm up the decoder while the user aims
        setStatus("scanning");

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let frame = 0;
        let busy = false;

        const tick = async () => {
          if (cancelled || doneRef.current) return;
          rafRef.current = requestAnimationFrame(tick);
          if (busy || video.readyState < 2 || !video.videoWidth) return;
          frame += 1;
          if (frame % 3 !== 0) return; // ~20 decodes/s
          busy = true;
          try {
            const scale = Math.min(1, 1280 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            let text = null;
            if (detectorRef.current) {
              const found = await detectorRef.current.detect(video);
              if (found?.length) text = found[0].rawValue;
            }
            if (!text) text = await decodeWithFallbacks(canvas);
            if (text) finish(text);
          } catch { /* ignore a bad frame */ }
          busy = false;
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        if (!cancelled) { setError(errorMessage(e)); setStatus("error"); }
      }
    })();

    return () => { cancelled = true; stop(); };
  }, [open, attempt, finish, stop]);

  // Esc closes
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      const canvas = canvasRef.current;
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const text = await decodeCanvas(canvas);
      if (text) finish(text);
      else setError(tr("Aucun code lisible dans cette image. Rapprochez-vous, évitez les reflets, puis réessayez."));
    } catch {
      setError(tr("Image illisible. Essayez une autre photo."));
    }
  }

  if (!open) return null;

  return createPortal(
    <>
      <div className="chat-overlay is-open" onClick={onClose} style={{ zIndex: 1199 }} />
      <div className="qrs-modal" role="dialog" aria-modal="true" aria-label={tr(title)}>
        <div className="qrs-head">
          <div className="qrs-title"><Icon name="qrcode" />{tr(title)}</div>
          <button className="chat-close" onClick={onClose} aria-label={tr("Fermer le scanner")}><Icon name="x" /></button>
        </div>

        <div className="qrs-view">
          <video ref={videoRef} className="qrs-video" muted playsInline />
          {status !== 'error' && (
            <div className="qrs-frame" aria-hidden="true"><span /><span /><span /><span /><i className="qrs-line" /></div>
          )}
          {status === 'starting' && <div className="qrs-overlay-msg">{tr("Ouverture de la caméra…")}</div>}
          {status === 'error' && (
            <div className="qrs-overlay-msg qrs-overlay-msg--err">
              <Icon name="scan" />
              <div>{tr(error)}</div>
            </div>
          )}
        </div>

        {status === 'scanning' && !error && (
          <div className="qrs-hint">{tr("Placez le QR code, DataMatrix ou code-barres dans le cadre, bien net et éclairé.")}</div>
        )}
        {status === 'scanning' && error && <div className="qrs-hint qrs-hint--err">{tr(error)}</div>}

        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPickFile} />

        <div className="qrs-actions">
          {status === 'error' && (
            <button className="btn" onClick={() => setAttempt((n) => n + 1)}><Icon name="scan" />{tr("Réessayer")}</button>
          )}
          <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="photo" />{tr("Scanner une photo")}</button>
          <button className="btn" onClick={onClose}>{tr("Saisir le lot manuellement")}</button>
        </div>
      </div>
    </>,
    document.body,
  );
}
