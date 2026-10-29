// Small DOM helpers for /login and /register-organization.
//
// They used to be globals defined by public/login.js (togglePw(), toggleChk(),
// showErr()...). They are plain ES exports now, so the pages import exactly
// what they use and nothing depends on a script having finished loading.
// They work on element ids because the form markup is uncontrolled inputs.

const byId = (id) => document.getElementById(id)

// ── Field errors ────────────────────────────────────────────────────────────
// The message text is normally already in the markup (rendered by React with
// t()), so it follows the language; only pass `message` for a one-off text.
export function showErr(inputId, errId, message) {
  byId(inputId)?.classList.add('invalid')
  const err = byId(errId)
  if (!err) return
  if (message != null) err.textContent = message
  err.classList.add('show')
}

export function clearErr(inputId, errId) {
  byId(inputId)?.classList.remove('invalid')
  byId(errId)?.classList.remove('show')
}

// ── Toast ───────────────────────────────────────────────────────────────────
let toastTimer
export function showToast(message, borderColor) {
  const el = byId('toast')
  if (!el) return
  el.textContent = message
  el.style.borderColor = borderColor || 'rgba(0,232,255,.28)'
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200)
}

// ── Password field ──────────────────────────────────────────────────────────
export function togglePw() {
  const input = byId('lc-pass')
  if (!input) return
  const show = input.type === 'password'
  input.type = show ? 'text' : 'password'
  const eye = byId('eye-ico')
  if (eye) eye.style.stroke = show ? '#00e8ff' : 'currentColor'
}

// Strength meter: 0–5 points (length ≥8, ≥12, upper-case, digit, symbol),
// shown as a coloured bar whose width is a fifth per point (capped at 5 bars).
const STRENGTH_STEPS = [
  { width: '20%', color: 'rgba(255,80,80,.7)' },
  { width: '40%', color: 'rgba(255,140,40,.7)' },
  { width: '60%', color: 'rgba(255,210,50,.7)' },
  { width: '80%', color: 'rgba(100,220,120,.7)' },
  { width: '100%', color: 'rgba(0,232,255,.8)' },
]

export function updateStrength(passwordId, barId) {
  const value = byId(passwordId)?.value ?? ''
  const bar = byId(barId)
  if (!bar) return
  if (!value) {
    bar.style.width = '0%'
    return
  }
  const points =
    (value.length >= 8) + (value.length >= 12) + /[A-Z]/.test(value) + /[0-9]/.test(value) + /[^A-Za-z0-9]/.test(value)
  const step = STRENGTH_STEPS[Math.min(points, 4)]
  bar.style.width = step.width
  bar.style.background = step.color
}

// Sign-up "passwords match" hint. Labels come from the caller (translated).
export function checkMatch(okLabel, noLabel) {
  const pass = byId('su-pass')?.value ?? ''
  const confirm = byId('su-confirm')?.value ?? ''
  const hint = byId('su-match')
  if (!hint) return
  if (!confirm) {
    hint.className = 'lc-match'
    return
  }
  const same = pass === confirm
  hint.className = `lc-match ${same ? 'ok' : 'no'}`
  hint.textContent = same ? okLabel : noLabel
}

// ── "Maintain session" checkbox ─────────────────────────────────────────────
export function toggleChk() {
  const label = byId('chklab')
  const tick = byId('lc-tk')
  const box = byId('lc-chk')
  if (!label || !tick || !box) return
  const on = label.getAttribute('aria-checked') !== 'true'
  tick.style.opacity = on ? '1' : '0'
  tick.style.transform = on ? 'scale(1)' : 'scale(.3)'
  box.style.borderColor = on ? 'rgba(0,232,255,.72)' : 'rgba(0,232,255,.38)'
  box.style.background = on ? 'rgba(0,232,255,.14)' : 'rgba(0,232,255,.05)'
  box.style.boxShadow = on ? '0 0 0 3px rgba(0,232,255,.12)' : '0 0 0 0 rgba(0,232,255,0)'
  label.setAttribute('aria-checked', String(on))
  const hint = byId('session-hint')
  if (hint) hint.style.display = on ? 'block' : 'none'
}

// ── Card height: the card animates between views of different heights ──────
export function syncViewHeight(viewIndex) {
  const wrap = document.querySelector('.lc-view-wrap')
  const view = document.querySelectorAll('.lc-views-track .lc-view')[viewIndex]
  if (!wrap || !view) return
  let height = 0
  for (const child of view.children) {
    const style = getComputedStyle(child)
    height += child.offsetHeight + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0)
  }
  wrap.style.height = Math.ceil(height) + 2 + 'px'
}

// ── MFA code: 6 digit boxes + 5 minute countdown ───────────────────────────
let mfaInterval = null

export function stopMfaTimer() {
  clearInterval(mfaInterval)
  mfaInterval = null
}

export function startMfaTimer(expiredLabel = 'Expired') {
  let remaining = 300
  const counter = byId('mfa-count')
  stopMfaTimer()
  mfaInterval = setInterval(() => {
    remaining--
    if (remaining <= 0) {
      stopMfaTimer()
      if (counter) counter.textContent = expiredLabel
      return
    }
    const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
    const ss = String(remaining % 60).padStart(2, '0')
    if (counter) counter.textContent = `${mm}:${ss}`
  }, 1000)
}

export function resendMfa(message) {
  const digits = document.querySelectorAll('.mfa-digit')
  digits.forEach((d) => { d.value = '' })
  digits[0]?.focus()
  startMfaTimer()
  showToast(message, 'rgba(0,232,255,.35)')
}

const submitMfa = () => byId('mfa-btn')?.click()

// Wires auto-advance, backspace-back and paste across the digit boxes.
// Returns the cleanup function (use it as a useEffect return value).
export function setupMfaInputs() {
  const digits = [...document.querySelectorAll('.mfa-digit')]
  const code = () => digits.map((d) => d.value).join('')
  const cleanups = []

  digits.forEach((input, i) => {
    const onInput = () => {
      input.value = input.value.replace(/[^0-9]/g, '')
      if (input.value && i < digits.length - 1) digits[i + 1].focus()
      if (code().length === 6) submitMfa()
    }
    const onKeyDown = (e) => {
      if (e.key === 'Backspace' && !input.value && i > 0) digits[i - 1].focus()
    }
    const onPaste = (e) => {
      e.preventDefault()
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '')
      ;[...pasted].forEach((ch, k) => { if (digits[i + k]) digits[i + k].value = ch })
      digits[Math.min(i + pasted.length, digits.length - 1)].focus()
      if (code().length === 6) setTimeout(submitMfa, 100)
    }
    input.addEventListener('input', onInput)
    input.addEventListener('keydown', onKeyDown)
    input.addEventListener('paste', onPaste)
    cleanups.push(() => {
      input.removeEventListener('input', onInput)
      input.removeEventListener('keydown', onKeyDown)
      input.removeEventListener('paste', onPaste)
    })
  })

  return () => cleanups.forEach((fn) => fn())
}

// Enter inside any text field of the card submits the sign-in form.
export function setupEnterToSubmit() {
  const onKey = (e) => {
    if (e.key === 'Enter' && document.activeElement?.classList.contains('lc-inp')) byId('auth-btn')?.click()
  }
  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
}
