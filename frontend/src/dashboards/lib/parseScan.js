// Turns whatever a QR / DataMatrix contains into a lot number.
// Supports: plain lot text, URLs (?lot=...), GS1 with parentheses
// "(01)…(17)…(10)LOT", and raw GS1 (AIs 01 / 17 / 10 / 21, FNC1 = \x1d).

const GS = '\x1d';

function yymmddToIso(v) {
  if (!/^\d{6}$/.test(v)) return null;
  const yy = Number(v.slice(0, 2));
  const mm = v.slice(2, 4);
  let dd = v.slice(4, 6);
  if (Number(mm) < 1 || Number(mm) > 12) return null;
  if (dd === '00') dd = '28';
  return `${yy < 70 ? 2000 + yy : 1900 + yy}-${mm}-${dd}`;
}

function parseGs1Parens(s) {
  const out = {};
  const re = /\((\d{2,4})\)([^(]*)/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = m[2].replace(GS, '').trim();
  return Object.keys(out).length ? out : null;
}

function parseGs1Raw(s) {
  const out = {};
  let i = 0;
  const fixed = { '01': 14, '02': 14, '11': 6, '13': 6, '15': 6, '17': 6 };
  const variable = { '10': 20, '21': 20, '30': 8, '37': 8 };
  while (i < s.length) {
    const ai = s.slice(i, i + 2);
    if (fixed[ai]) {
      out[ai] = s.slice(i + 2, i + 2 + fixed[ai]);
      i += 2 + fixed[ai];
    } else if (variable[ai]) {
      let end = s.indexOf(GS, i + 2);
      if (end === -1) end = s.length;
      end = Math.min(end, i + 2 + variable[ai]);
      out[ai] = s.slice(i + 2, end);
      i = end;
      if (s[i] === GS) i += 1;
    } else {
      return Object.keys(out).length ? out : null;
    }
  }
  return Object.keys(out).length ? out : null;
}

export function parseScan(rawInput) {
  const raw = String(rawInput ?? '').trim();
  const res = { raw, lot: raw, expiry: null, gtin: null };
  if (!raw) return res;

  // 1) URL
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      for (const k of ['lot', 'lotnumber', 'lot_number', 'batch', 'batchnumber', 'l']) {
        for (const [pk, pv] of u.searchParams.entries()) {
          if (pk.toLowerCase() === k && pv) { res.lot = pv.trim(); return res; }
        }
      }
    } catch { /* keep raw */ }
    return res;
  }

  // 2) GS1
  const gs1 = (raw.includes('(') ? parseGs1Parens(raw) : null) ||
              (/^\x1d?(01|02|10|17|21|11)/.test(raw) && (raw.length >= 16 || raw.includes(GS)) ? parseGs1Raw(raw.replace(/^\]d2|^\]Q3|^\]C1/, '')) : null);
  if (gs1) {
    if (gs1['10']) res.lot = gs1['10'];
    if (gs1['17']) res.expiry = yymmddToIso(gs1['17']);
    if (gs1['01']) res.gtin = gs1['01'];
    if (!gs1['10'] && !gs1['01']) res.lot = raw;
    return res;
  }

  // 3) JSON {"lot":"…"}
  if (raw.startsWith('{')) {
    try {
      const j = JSON.parse(raw);
      const v = j.lot ?? j.lotNumber ?? j.batch;
      if (v) res.lot = String(v).trim();
    } catch { /* keep raw */ }
  }
  return res;
}
