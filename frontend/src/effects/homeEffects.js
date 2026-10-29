// homeEffects.js — VigiCore NEXUS
//
// The canvas / animation engine that used to live in public/script.js as one
// 1800-line classic script. It is now an ES module with a real lifecycle:
//
//   const stop = startHomeEffects()   // bind to the DOM that exists right now
//   stop()                            // undo everything (listeners, rAF, timers, observers)
//
// useHomeEffects() (src/hooks/useHomeEffects.js) calls it from useEffect, so
// every mount of a page gets a fresh, correctly-bound engine and every unmount
// tears it down. That removes the old "load the script once and never again"
// guard, and the duplicated loops / dead buttons that came with it.
//
// Plain DOM behaviour (theme, drawer, reveal, scroll-spy, anchors, cursor glow)
// is no longer in here: it moved to React hooks in src/hooks/.
//
// How cleanup works without rewriting the engine body: `window`, `document`,
// the timers, rAF and IntersectionObserver are *parameters* of run(), so the
// body below transparently talks to tracked versions of them.

// Canvas sizing shared by the full-screen and per-section effects (pixel ratio capped at 1.5).
import { prefersReducedMotion } from '../lib/motion.js'

const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 1.5)

/** Fills the viewport; returns the CSS-pixel [width, height] that drawing code should use. */
function fitCanvasToViewport(canvas, ctx) {
  const k = pixelRatio()
  canvas.width = innerWidth * k
  canvas.height = innerHeight * k
  ctx.scale(k, k)
  return [innerWidth * k, innerHeight * k]
}

/** Matches the canvas to its own box; returns that box's [width, height]. */
function fitCanvasToElement(canvas, ctx) {
  const k = pixelRatio()
  const w = canvas.offsetWidth
  const h = canvas.offsetHeight
  canvas.width = w * k
  canvas.height = h * k
  ctx.scale(k, k)
  return [w, h]
}

function track(target, cleanups) {
  return new Proxy(target, {
    get(obj, key) {
      if (key === 'addEventListener') {
        return (type, fn, opts) => {
          obj.addEventListener(type, fn, opts)
          cleanups.push(() => obj.removeEventListener(type, fn, opts))
        }
      }
      const value = Reflect.get(obj, key, obj)
      return typeof value === 'function' ? value.bind(obj) : value
    },
    set(obj, key, value) {
      obj[key] = value
      return true
    },
  })
}

export function startHomeEffects() {
  let alive = true
  const cleanups = []
  const timers = new Set()
  const intervals = new Set()
  const frames = new Set()

  const win = track(window, cleanups)
  const doc = track(document, cleanups)

  const raf = (cb) => {
    const id = window.requestAnimationFrame((time) => {
      frames.delete(id)
      if (alive) cb(time)
    })
    frames.add(id)
    return id
  }
  const caf = (id) => {
    frames.delete(id)
    window.cancelAnimationFrame(id)
  }
  const timeout = (fn, ms, ...args) => {
    const id = window.setTimeout(() => {
      timers.delete(id)
      if (alive) fn(...args)
    }, ms)
    timers.add(id)
    return id
  }
  const clearTimeoutT = (id) => {
    timers.delete(id)
    window.clearTimeout(id)
  }
  const interval = (fn, ms, ...args) => {
    const id = window.setInterval(() => alive && fn(...args), ms)
    intervals.add(id)
    return id
  }
  const clearIntervalT = (id) => {
    intervals.delete(id)
    window.clearInterval(id)
  }
  function TrackedIntersectionObserver(cb, opts) {
    const io = new window.IntersectionObserver(cb, opts)
    cleanups.push(() => io.disconnect())
    return io
  }

  run(win, doc, raf, caf, timeout, clearTimeoutT, interval, clearIntervalT, TrackedIntersectionObserver)

  return function stop() {
    alive = false
    frames.forEach((id) => window.cancelAnimationFrame(id))
    timers.forEach((id) => window.clearTimeout(id))
    intervals.forEach((id) => window.clearInterval(id))
    frames.clear()
    timers.clear()
    intervals.clear()
    cleanups.splice(0).forEach((fn) => fn())
  }
}

/* eslint-disable no-undef */
function run(
  window,
  document,
  requestAnimationFrame,
  cancelAnimationFrame,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  IntersectionObserver,
) {
  const REDUCED_MOTION = prefersReducedMotion()
  // Sizes a full-screen canvas now and on every resize; `setSize` receives the new drawing size.
  function trackViewportCanvas(canvas, ctx, setSize) {
    const fit = () => setSize(...fitCanvasToViewport(canvas, ctx))
    fit()
    window.addEventListener('resize', () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      fit()
    })
  }
  function getTheme() {
    return 'light' === document.documentElement.getAttribute('data-theme') ? 'light' : 'dark'
  }
  function isLight() {
    return 'light' === getTheme()
  }
  const bgCanvas = document.getElementById('bg-canvas'),
    bgCtx = bgCanvas ? bgCanvas.getContext('2d') : null
  let animateBg = null
  if (!REDUCED_MOTION && bgCanvas && bgCtx) {
    function resizeBg() {
      const e = pixelRatio()
      ;((bgCanvas.width = innerWidth * e), (bgCanvas.height = innerHeight * e), bgCtx.scale(e, e))
    }
    function createStar(e, t) {
      return {
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        r: 1 * Math.random() + 0.2,
        vy: e * (0.5 * Math.random() + 0.6),
        a: t,
        tw: Math.random() * Math.PI * 2,
        tws: 0.012 * Math.random() + 0.003,
        color: Math.random() < 0.08 ? '0,232,255' : Math.random() < 0.12 ? '0,255,200' : '160,210,240',
      }
    }
    ;(resizeBg(), window.addEventListener('resize', resizeBg))
    const e = [
        Array.from(
          {
            length: 28,
          },
          () => createStar(0.06, 0.45 + 0.3 * Math.random()),
        ),
        Array.from(
          {
            length: 18,
          },
          () => createStar(0.13, 0.35 + 0.25 * Math.random()),
        ),
        Array.from(
          {
            length: 8,
          },
          () => createStar(0.24, 0.45 + 0.25 * Math.random()),
        ),
        Array.from(
          {
            length: 26,
          },
          () => {
            const e = createStar(0.03, 0.05 + 0.08 * Math.random())
            return ((e.r = 0.12 + 0.28 * Math.random()), e)
          },
        ),
      ],
      t = Array.from(
        {
          length: 6,
        },
        () => ({
          x: Math.random() * innerWidth,
          y: Math.random() * innerHeight,
          r: 100 + 160 * Math.random(),
          vx: 0.14 * (Math.random() - 0.5),
          vy: 0.1 * (Math.random() - 0.5),
          a: 0.018 + 0.028 * Math.random(),
          color: Math.random() < 0.4 ? '0,232,255' : Math.random() < 0.55 ? '0,128,255' : '0,255,200',
        }),
      )
    function drawBgGradient() {
      const e = innerWidth,
        t = innerHeight
      if (isLight()) return void bgCtx.clearRect(0, 0, e, t)
      const n = bgCtx.createLinearGradient(0, 0, 0, t)
      ;(n.addColorStop(0, '#020a18'),
        n.addColorStop(0.4, '#020b16'),
        n.addColorStop(1, '#010810'),
        (bgCtx.fillStyle = n),
        bgCtx.fillRect(0, 0, e, t))
      const o = bgCtx.createRadialGradient(0.5 * e, 0.38 * t, 0, 0.5 * e, 0.38 * t, 0.4 * e)
      ;(o.addColorStop(0, 'rgba(0,50,80,0.05)'),
        o.addColorStop(0.5, 'rgba(0,25,55,0.025)'),
        o.addColorStop(1, 'transparent'),
        (bgCtx.fillStyle = o),
        bgCtx.fillRect(0, 0, e, t))
    }
    animateBg = function () {
      const n = innerWidth,
        o = innerHeight
      ;(drawBgGradient(),
        t.forEach((e) => {
          ;((e.x += e.vx),
            (e.y += e.vy),
            e.x < -e.r && (e.x = n + e.r),
            e.x > n + e.r && (e.x = -e.r),
            e.y < -e.r && (e.y = o + e.r),
            e.y > o + e.r && (e.y = -e.r))
          const t = bgCtx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r)
          ;(t.addColorStop(0, `rgba(${e.color},${e.a})`),
            t.addColorStop(1, `rgba(${e.color},0)`),
            bgCtx.beginPath(),
            bgCtx.arc(e.x, e.y, e.r, 0, 2 * Math.PI),
            (bgCtx.fillStyle = t),
            bgCtx.fill())
        }),
        e.forEach((e) => {
          e.forEach((e) => {
            ;((e.y += e.vy), (e.tw += e.tws), e.y > o + 4 && ((e.y = -4), (e.x = Math.random() * n)))
            const t = e.a * (0.65 + 0.35 * Math.sin(e.tw))
            ;(bgCtx.beginPath(),
              bgCtx.arc(e.x, e.y, e.r, 0, 2 * Math.PI),
              (bgCtx.fillStyle = `rgba(${e.color},${t.toFixed(2)})`),
              bgCtx.fill())
          })
        }))
    }
  }
  let drawRaysFn = null
  !(function () {
    if (REDUCED_MOTION) return
    const e = document.getElementById('rays-canvas'),
      t = e.getContext('2d')
    trackViewportCanvas(e, t, () => {}) // la taille n'est pas relue : le dessin utilise innerWidth / innerHeight
    const r = Array.from(
      {
        length: 9,
      },
      (e, t) => ({
        angle: (t / 9) * Math.PI * 2,
        width: 0.02 + 0.025 * Math.random(),
        length: 0.34 + 0.22 * Math.random(),
        alpha: 0.022 + 0.022 * Math.random(),
        phase: Math.random() * Math.PI * 2,
        speed: 3e-4 + 3e-4 * Math.random(),
      }),
    )
    drawRaysFn = function (e) {
      const n = innerWidth,
        o = innerHeight
      t.clearRect(0, 0, n, o)
      const a = 0.5 * n,
        i = 0.44 * o
      r.forEach((r) => {
        r.angle += r.speed
        const l = 0.7 + 0.3 * Math.sin(4e-4 * e + r.phase),
          s = r.width * l,
          d = Math.max(n, o) * r.length * l,
          c = r.angle - s,
          h = r.angle + s,
          m = a + Math.cos(c) * d,
          g = i + Math.sin(c) * d,
          u = a + Math.cos(h) * d,
          f = i + Math.sin(h) * d,
          v = t.createRadialGradient(a, i, 0, a, i, d),
          y = r.alpha * l
        ;(v.addColorStop(0, `rgba(0,232,255,${(2.2 * y).toFixed(3)})`),
          v.addColorStop(0.3, `rgba(0,200,255,${(1.1 * y).toFixed(3)})`),
          v.addColorStop(0.7, `rgba(0,128,255,${(0.5 * y).toFixed(3)})`),
          v.addColorStop(1, 'rgba(0,80,200,0)'),
          t.beginPath(),
          t.moveTo(a, i),
          t.lineTo(m, g),
          t.lineTo(u, f),
          t.closePath(),
          (t.fillStyle = v),
          t.fill())
      })
    }
  })()
  let drawMotesFn = null
  !(function () {
    if (REDUCED_MOTION) return
    const e = document.getElementById('ambient-particles-canvas'),
      t = e.getContext('2d')
    trackViewportCanvas(e, t, () => {}) // la taille n'est pas relue : le dessin utilise innerWidth / innerHeight
    const r = ['0,232,255', '0,255,200', '40,180,255', '0,200,255', '80,240,220', '160,230,255']
    function i() {
      return {
        x: Math.random() * innerWidth,
        y: innerHeight + 10,
        r: 0.4 + 1.4 * Math.random(),
        vy: -(0.09 + 0.16 * Math.random()),
        vx: 0.07 * (Math.random() - 0.5),
        alpha: 0.1 + 0.22 * Math.random(),
        life: 0,
        maxLife: 260 + 320 * Math.random(),
        color: r[Math.floor(Math.random() * r.length)],
        wobble: Math.random() * Math.PI * 2,
        wobbleS: 0.006 + 0.01 * Math.random(),
      }
    }
    const l = Array.from(
      {
        length: 55,
      },
      (e, t) => {
        const n = i()
        return (
          t >= 38 &&
            ((n.r = 0.2 + 0.5 * Math.random()),
            (n.alpha = 0.03 + 0.05 * Math.random()),
            (n.vy = -(0.04 + 0.08 * Math.random())),
            (n.maxLife = 380 + 440 * Math.random())),
          (n.y = Math.random() * innerHeight),
          (n.life = Math.random() * n.maxLife),
          n
        )
      },
    )
    drawMotesFn = function (e) {
      ;(t.clearRect(0, 0, innerWidth, innerHeight),
        l.forEach((e) => {
          if (((e.life += 1), e.life > e.maxLife)) return void Object.assign(e, i())
          ;((e.wobble += e.wobbleS), (e.x += e.vx + 0.06 * Math.sin(e.wobble)), (e.y += e.vy))
          const n = e.life / e.maxLife,
            o = n < 0.12 ? n / 0.12 : n > 0.8 ? (1 - n) / 0.2 : 1,
            a = e.alpha * o
          if (a < 0.01) return
          const r = t.createRadialGradient(e.x, e.y, 0, e.x, e.y, 5 * e.r)
          ;(r.addColorStop(0, `rgba(${e.color},${(0.55 * a).toFixed(3)})`),
            r.addColorStop(1, `rgba(${e.color},0)`),
            t.beginPath(),
            t.arc(e.x, e.y, 5 * e.r, 0, 2 * Math.PI),
            (t.fillStyle = r),
            t.fill(),
            t.beginPath(),
            t.arc(e.x, e.y, e.r, 0, 2 * Math.PI),
            (t.fillStyle = `rgba(${e.color},${a.toFixed(3)})`),
            (t.shadowColor = `rgba(${e.color},${(0.9 * a).toFixed(3)})`),
            (t.shadowBlur = 6),
            t.fill(),
            (t.shadowBlur = 0))
        }))
    }
  })()
  const ECG_PTS = [
      [0, 0.5],
      [0.1045, 0.5],
      [0.1493, 0.3864],
      [0.194, 0.5],
      [0.2537, 0.5],
      [0.2985, 0.1818],
      [0.3582, 0.8182],
      [0.403, 0.5],
      [0.4627, 0.5],
      [0.5075, 0.3409],
      [0.5522, 0.5],
      [0.597, 0.5],
      [0.6418, 0.3636],
      [0.6866, 0.5],
      [0.7463, 0.5],
      [0.8209, 0.5],
      [0.8955, 0.5],
      [1, 0.5],
    ],
    ecgDrawFns = [],
    masterDrawFns = []
  function createECG(e, t) {
    if (!e) return
    const n = t || {},
      o = 1.35 * (void 0 !== n.speedMultiplier ? n.speedMultiplier : 1),
      a = e.getContext('2d')
    let r = 0
    const i = new Set([5, 6])
    function l(e) {
      const t = ECG_PTS.length
      a.moveTo(e[0][0], e[0][1])
      for (let n = 1; n < e.length; n++) {
        const o = n % t,
          r = (n - 1) % t
        if (i.has(o) || i.has(r)) {
          a.lineTo(e[n][0], e[n][1])
          continue
        }
        const l = e[n - 1],
          s = e[n]
        a.quadraticCurveTo(l[0], l[1], (l[0] + s[0]) / 2, (l[1] + s[1]) / 2)
      }
      a.lineTo(e[e.length - 1][0], e[e.length - 1][1])
    }
    function s() {
      const t = e.offsetWidth || 92,
        n = e.offsetHeight || 34
      ;(a.clearRect(0, 0, t, n), (r = (r + o) % t))
      const i = (function (t) {
          const n = e.offsetWidth || 92,
            o = e.offsetHeight || 34,
            a = []
          for (let e = 0; e < 3; e++)
            ECG_PTS.forEach(([r, i]) => {
              a.push([(r + e) * n - t, i * o])
            })
          return a
        })(r),
        s = a.createLinearGradient(0, 0, t, 0)
      ;(s.addColorStop(0, 'rgba(0,255,210,0)'),
        s.addColorStop(0.2, 'rgba(0,255,210,0.28)'),
        s.addColorStop(0.55, 'rgba(0,240,255,0.32)'),
        s.addColorStop(0.8, 'rgba(56,200,255,0.28)'),
        s.addColorStop(1, 'rgba(56,200,255,0)'),
        a.beginPath(),
        l(i),
        (a.strokeStyle = s),
        (a.lineWidth = 6.5),
        (a.lineJoin = 'round'),
        (a.lineCap = 'round'),
        a.stroke())
      const d = a.createLinearGradient(0, 0, t, 0)
      ;(d.addColorStop(0, 'rgba(0,255,204,0)'),
        d.addColorStop(0.2, 'rgba(0,255,204,0.9)'),
        d.addColorStop(0.55, 'rgba(0,240,255,1)'),
        d.addColorStop(0.8, 'rgba(56,200,255,0.9)'),
        d.addColorStop(1, 'rgba(56,200,255,0)'),
        a.beginPath(),
        l(i),
        (a.strokeStyle = d),
        (a.lineWidth = 2),
        (a.lineJoin = 'round'),
        (a.lineCap = 'round'),
        (a.shadowColor = 'rgba(0,255,210,0.9)'),
        (a.shadowBlur = 7),
        a.stroke(),
        (a.shadowBlur = 0))
    }
    ;(setTimeout(function () {
      const t = pixelRatio(),
        n = e.offsetWidth || 92,
        o = e.offsetHeight || 34
      ;((e.width = n * t), (e.height = o * t), a.setTransform(t, 0, 0, t, 0, 0))
    }, 50),
      setTimeout(() => {
        ;(s(), ecgDrawFns.push(s))
      }, 60))
  }
  createECG(document.getElementById('ecg-canvas-monitor'), {
    speedMultiplier: 1,
  })
  createECG(document.getElementById('ecg-canvas'), {
    speedMultiplier: 1,
  })
  createECG(document.getElementById('ecg-canvas-core'), {
    speedMultiplier: 1,
  })
  let mx = 0,
    my = 0,
    targetMx = 0,
    targetMy = 0
  REDUCED_MOTION ||
    document.addEventListener('mousemove', (e) => {
      ;((targetMx = 2 * (e.clientX / innerWidth - 0.5)), (targetMy = 2 * (e.clientY / innerHeight - 0.5)))
    })
  const parallaxItems = [
      {
        selector: '.module-tl',
        fx: -6,
        fy: -4.5,
      },
      {
        selector: '.module-tr',
        fx: 6,
        fy: -4.5,
      },
      {
        selector: '.module-bl',
        fx: -6,
        fy: 4.5,
      },
      {
        selector: '.module-br',
        fx: 6,
        fy: 4.5,
      },
      {
        selector: '.module-top',
        fx: 0,
        fy: -7,
      },
      {
        selector: '.shield-wrap',
        fx: 2.5,
        fy: 2.5,
      },
    ],
    parallaxElems = parallaxItems.map((e) => ({
      ...e,
      el: document.querySelector(e.selector),
    }))
  function parallaxTick() {
    REDUCED_MOTION ||
      ((mx += 0.06 * (targetMx - mx)),
      (my += 0.06 * (targetMy - my)),
      parallaxElems.forEach(({ el: e, fx: t, fy: n, selector: o }) => {
        if (e)
          if ('.shield-wrap' === o) {
            const o = e.classList.contains('any-active') ? 1.045 : 1,
              a = parseFloat(e.dataset.curScale || '1.0'),
              r = a + 0.055 * (o - a)
            ;((e.dataset.curScale = r),
              (e.style.transform = `translate(${(mx * t).toFixed(2)}px, ${(my * n).toFixed(2)}px) scale(${r.toFixed(4)})`))
          } else e.style.transform = `translate(${(mx * t).toFixed(1)}px, ${(my * n).toFixed(1)}px)`
      }))
  }
  ;(function () {
    const e = document.getElementById('solution-canvas')
    if (!e) return
    const t = e.getContext('2d')
    let n, o
    function a() {
      ;[n, o] = fitCanvasToElement(e, t)
    }
    ;(a(), window.addEventListener('resize', a))
    const r = []
    for (let e = 0; e <= 8; e++)
      for (let t = 0; t <= 14; t++)
        (Math.random() < 0.6 &&
          r.push({
            x1: (t / 14) * 100,
            y1: (e / 8) * 100,
            x2: ((t + 1) / 14) * 100,
            y2: (e / 8) * 100,
            alpha: 0.04 + 0.06 * Math.random(),
          }),
          Math.random() < 0.6 &&
            r.push({
              x1: (t / 14) * 100,
              y1: (e / 8) * 100,
              x2: (t / 14) * 100,
              y2: ((e + 1) / 8) * 100,
              alpha: 0.03 + 0.04 * Math.random(),
            }))
    const i = Array.from(
      {
        length: 30,
      },
      () => ({
        x: 100 * Math.random(),
        y: 100 * Math.random(),
        vx: 0.3 * (Math.random() - 0.5),
        vy: 0.3 * (Math.random() - 0.5),
        r: 0.8 + 1.2 * Math.random(),
        alpha: 0.2 + 0.4 * Math.random(),
        color: Math.random() < 0.5 ? '0,255,200' : '0,232,255',
      }),
    )
    let l = 0
    function s() {
      ;(t.clearRect(0, 0, n, o), l++)
      const e = isLight(),
        a = e ? '0,160,180' : '0,232,255'
      ;(r.forEach((r) => {
        const i = 0.5 + 0.5 * Math.sin(0.015 * l + 0.05 * r.x1)
        ;(t.save(),
          (t.globalAlpha = (e ? 0.5 * r.alpha : r.alpha) * i),
          (t.strokeStyle = `rgba(${a},1)`),
          (t.lineWidth = 0.5),
          t.beginPath(),
          t.moveTo((r.x1 / 100) * n, (r.y1 / 100) * o),
          t.lineTo((r.x2 / 100) * n, (r.y2 / 100) * o),
          t.stroke(),
          t.restore())
      }),
        i.forEach((a) => {
          ;((a.x += a.vx),
            (a.y += a.vy),
            a.x < 0 && (a.x = 100),
            a.x > 100 && (a.x = 0),
            a.y < 0 && (a.y = 100),
            a.y > 100 && (a.y = 0))
          const r = e ? a.color.replace('0,255,200', '0,180,160').replace('0,232,255', '0,160,190') : a.color
          ;(t.save(),
            (t.globalAlpha = e ? 0.5 * a.alpha : a.alpha),
            (t.fillStyle = `rgba(${r},1)`),
            (t.shadowColor = `rgba(${r},0.8)`),
            (t.shadowBlur = e ? 3 : 5),
            t.beginPath(),
            t.arc((a.x / 100) * n, (a.y / 100) * o, a.r, 0, 2 * Math.PI),
            t.fill(),
            t.restore())
        }))
    }
    ;(REDUCED_MOTION || masterDrawFns.push(s), s())
  })()
  ;(function () {
    const e = document.getElementById('cta-canvas')
    if (!e) return
    const t = e.getContext('2d')
    let n, o
    function a() {
      ;[n, o] = fitCanvasToElement(e, t)
    }
    ;(a(), window.addEventListener('resize', a))
    const r = Array.from(
      {
        length: 16,
      },
      (e, t) => ({
        angle: (t / 16) * Math.PI * 2,
        len: 200 + 150 * Math.random(),
        alpha: 0.03 + 0.06 * Math.random(),
        speed: 0.003 + 0.004 * Math.random(),
        phase: Math.random() * Math.PI * 2,
      }),
    )
    let i = 0
    function l() {
      ;(t.clearRect(0, 0, n, o), i++)
      const e = n / 2,
        a = o / 2
      r.forEach((n) => {
        n.angle += n.speed
        const o = 0.5 + 0.5 * Math.sin(0.012 * i + n.phase)
        ;(t.save(), (t.globalAlpha = n.alpha * o))
        const r = t.createLinearGradient(e, a, e + Math.cos(n.angle) * n.len, a + Math.sin(n.angle) * n.len)
        ;(r.addColorStop(0, 'rgba(0,232,255,0.8)'),
          r.addColorStop(1, 'rgba(0,232,255,0)'),
          (t.strokeStyle = r),
          (t.lineWidth = 1),
          t.beginPath(),
          t.moveTo(e, a),
          t.lineTo(e + Math.cos(n.angle) * n.len, a + Math.sin(n.angle) * n.len),
          t.stroke(),
          t.restore())
      })
    }
    ;(REDUCED_MOTION || masterDrawFns.push(l), l())
  })()
  document.querySelectorAll('.actor-card').forEach((e) => {
    const t = e.dataset.color || 'rgba(0,232,255,0.5)'
    ;(e.style.setProperty('--card-color', t), e.style.setProperty('--card-glow', t.replace('0.5)', '0.07)')))
  })
  ;(function () {
    const e = document.getElementById('hero'),
      t = document.getElementById('system')
    e &&
      t &&
      window.addEventListener(
        'scroll',
        () => {
          const n = window.scrollY,
            o = e.offsetHeight
          if (n > o) return
          const a = Math.min(n / (0.8 * o), 1),
            r = 1 + 0.18 * a,
            i = 1 - 0.6 * a
          ;((t.style.transform = `scale(${r})`),
            (t.style.opacity = i),
            (e.style.filter = `brightness(${1 - 0.25 * a})`))
        },
        {
          passive: !0,
        },
      )
  })()
  let lastFrame = 0
  function masterLoop(now) {
    // onglet masqué ou défilement en cours (voir effects/scrollState.js) : on ne redessine pas
    if (document.hidden || window.__vgScrolling || now - lastFrame < (window.__vgLite ? 66 : 33)) {
      requestAnimationFrame(masterLoop)
      return
    }
    lastFrame = now
    if (animateBg) animateBg()
    if (drawRaysFn) drawRaysFn(now)
    if (drawMotesFn) drawMotesFn(now)
    ecgDrawFns.forEach((fn) => fn())
    parallaxTick()
    masterDrawFns.forEach((fn) => fn())
    requestAnimationFrame(masterLoop)
  }
  requestAnimationFrame(masterLoop)
  ;(function () {
    const e = document.getElementById('conv-pipeline')
    if (!e) return
    const t = new IntersectionObserver(
      (n) => {
        n.forEach((n) => {
          n.isIntersecting && (e.classList.add('in-view'), t.disconnect())
        })
      },
      {
        threshold: 0.18,
      },
    )
    t.observe(e)
  })()
  ;(function () {
    const e = document.getElementById('dashboard-frame')
    if (!e) return
    const t = new IntersectionObserver(
      (n) => {
        n[0].isIntersecting &&
          (e.querySelectorAll('.db-domain-bar-fill').forEach((e, t) => {
            setTimeout(() => {
              e.style.width = getComputedStyle(e).getPropertyValue('--fill-pct') || '90%'
            }, 130 * t)
          }),
          t.disconnect())
      },
      {
        threshold: 0.2,
      },
    )
    t.observe(e)
  })()
  ;(function () {
    // "Response delayed by N days": counts up ONCE to the illustrative value
    // and stays there. It used to bounce between 12 and 47 forever, which made
    // the figure look random rather than like a statistic.
    const e = document.getElementById('wdc-value')
    if (!e) return
    const TARGET = 46
    const reduce = prefersReducedMotion()
    const show = (n) => { e.textContent = n < 10 ? '0' + n : String(n) }
    if (reduce) return void show(TARGET)
    let started = false
    function run() {
      if (started) return
      started = true
      // time-based (1.4s), so a slow device still ends on the right number
      const DURATION = 1400
      const t0 = performance.now()
      const step = (now) => {
        const k = Math.min(1, (now - t0) / DURATION)
        show(Math.round(TARGET * k))
        if (k < 1) requestAnimationFrame(step)
      }
      show(0)
      requestAnimationFrame(step)
    }
    const r = document.getElementById('zoom-section')
    if (!r || typeof IntersectionObserver === 'undefined') return void run()
    const i = new IntersectionObserver(
      (en) => {
        if (en[0].isIntersecting) { run(); i.disconnect() }
      },
      { threshold: 0.2 },
    )
    i.observe(r)
  })()
  ;(function () {
    const e = document.querySelector('.wim-compliance-meter')
    if (!e) return
    const t = document.querySelector('.wcm-value'),
      n = new IntersectionObserver(
        (o) => {
          if (o[0].isIntersecting) {
            if (
              (e.querySelectorAll('.wcm-bar-fill').forEach((e, t) => {
                setTimeout(() => {
                  e.style.width = getComputedStyle(e).getPropertyValue('--wcm-w') || '50%'
                }, 180 * t)
              }),
              t)
            ) {
              let e = 0
              const n = 45,
                o = setInterval(() => {
                  ;(e++, (t.textContent = e + '%'), e >= n && clearInterval(o))
                }, 28)
            }
            n.disconnect()
          }
        },
        {
          threshold: 0.3,
        },
      )
    n.observe(e)
  })()
  ;(function () {
    const e = document.getElementById('conv-pipeline')
    if (!e) return
    const t = [
      {
        el: document.getElementById('cic-1'),
        val: 14,
        min: 12,
        max: 19,
      },
      {
        el: document.getElementById('cic-2'),
        val: 31,
        min: 28,
        max: 36,
      },
      {
        el: document.getElementById('cic-3'),
        val: 8,
        min: 6,
        max: 11,
      },
      {
        el: document.getElementById('cic-4'),
        val: 22,
        min: 19,
        max: 25,
      },
      {
        el: document.getElementById('cic-5'),
        val: 11,
        min: 9,
        max: 15,
      },
    ]
    function n() {
      t.forEach((e) => {
        e.el &&
          (Math.random() < 0.35 && (e.val++, e.val > e.max && (e.val = e.min)), (e.el.textContent = e.val))
      })
    }
    const o = document.getElementById('conv-packets')
    let a = 0,
      r = !1
    function i() {
      o &&
        r &&
        ((a += Math.floor(4 * Math.random()) + 2), (o.textContent = a.toLocaleString()), setTimeout(i, 120))
    }
    const l = new IntersectionObserver(
      (e) => {
        e[0].isIntersecting && (n(), setInterval(n, 2800), (r = !0), i(), l.disconnect())
      },
      {
        threshold: 0.25,
      },
    )
    l.observe(e)
  })()
  ;(function () {
    const e = document.getElementById('trust-strip')
    if (!e) return
    const t = new IntersectionObserver(
      (n) => {
        n[0].isIntersecting &&
          (e.querySelectorAll('.trust-stat-num[data-count]').forEach((e) =>
            (function (e) {
              const t = parseInt(e.dataset.count, 10),
                n = e.dataset.suffix || ''
              if (isNaN(t)) return
              let o = 0
              const a = Math.max(1, Math.ceil(t / 40)),
                r = setInterval(() => {
                  ;((o = Math.min(o + a, t)), (e.textContent = o + n), o >= t && clearInterval(r))
                }, 28)
            })(e),
          ),
          e.querySelectorAll('.trust-stat-bar-fill').forEach((e, t) => {
            setTimeout(() => {
              e.style.width = getComputedStyle(e).getPropertyValue('--sb-w') || '80%'
            }, 150 * t)
          }),
          t.disconnect())
      },
      {
        threshold: 0.3,
      },
    )
    t.observe(e)
  })()
  ;(function () {
    const e = document.getElementById('hero')
    if (!e) return
    const t = [
      document.getElementById('bg-canvas'),
      document.getElementById('rays-canvas'),
      document.getElementById('ambient-particles-canvas'),
    ].filter(Boolean)
    if (!t.length) return
    new IntersectionObserver(
      (e) => {
        const n = e[0].isIntersecting
        t.forEach((e) => {
          ;((e.style.opacity = n ? '1' : '0'), (e.dataset.paused = n ? '' : 'true'))
        })
      },
      {
        threshold: 0.01,
      },
    ).observe(e)
  })()
}
