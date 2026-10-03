/**
 * The little landscape painting inside each museum frame (her flops and the Grown-ups' Wing).
 * Inline SVG, drawn in code. The look is seeded from the record's id ONLY — never from its fear
 * numbers or outcome — so a painting is the same every visit and no flop "looks worse" than another.
 *
 * Calm, hopeful scenes: a sky, a sun, soft clouds, mountains and hills, sometimes a little tree, a
 * winding path, birds or a lake. No figures, no falls, nothing funny: these hang with respect.
 */
import { createRng, type Rng } from '../../model/rng'

interface Palette {
  skyTop: string
  skyBottom: string
  sun: string
  far: string
  farCap: string
  mid: string
  near: string
  accent: string
}

const PALETTES: readonly Palette[] = [
  // Dawn
  { skyTop: '#f9c9b4', skyBottom: '#fff1df', sun: '#f7b551', far: '#e2b2a3', farCap: '#fff4ea', mid: '#d39784', near: '#b9786a', accent: '#8c5547' },
  // Meadow morning
  { skyTop: '#bfe0ec', skyBottom: '#fbf3dc', sun: '#f5c75a', far: '#a6c7c9', farCap: '#f6fbf8', mid: '#9cc785', near: '#6fa45a', accent: '#4c7a3e' },
  // Lake
  { skyTop: '#b3d8e6', skyBottom: '#eaf6f2', sun: '#fbe39a', far: '#94b9c9', farCap: '#f4fafc', mid: '#7aa8b9', near: '#548aa0', accent: '#386a7f' },
  // Dusk
  { skyTop: '#b8a2d8', skyBottom: '#f8cbb6', sun: '#ffd38a', far: '#9584bb', farCap: '#f3ecfb', mid: '#77669f', near: '#574a82', accent: '#3f3563' },
  // Autumn
  { skyTop: '#f6d3a6', skyBottom: '#fff4e0', sun: '#f08c50', far: '#deae86', farCap: '#fff6ec', mid: '#cf8a57', near: '#a9653d', accent: '#7b4527' },
  // Snow
  { skyTop: '#c9def2', skyBottom: '#f7fbff', sun: '#ffe9a8', far: '#c3d2e4', farCap: '#ffffff', mid: '#a9bdd6', near: '#8299b7', accent: '#5d7395' },
]

let uid = 0

function f(n: number): string {
  return n.toFixed(1)
}

/** A smooth row of hills along y = base (± amp), as a closed path to the bottom of the picture. */
function hillPath(r: Rng, base: number, amp: number, humps: number): string {
  const W = 160
  const H = 120
  let d = `M0 ${f(H)} L0 ${f(base - r.range(0, amp))}`
  for (let i = 0; i < humps; i++) {
    const x0 = (W * i) / humps
    const x1 = (W * (i + 1)) / humps
    const peak = base - amp * r.range(0.6, 1.25)
    const end = base - amp * r.range(0.05, 0.5)
    d += ` Q${f((x0 + x1) / 2)} ${f(peak)} ${f(x1)} ${f(end)}`
  }
  return `${d} L${W} ${H} Z`
}

/** 2–3 mountain peaks (with snowy caps) on the horizon. */
function mountains(r: Rng, p: Palette): string {
  const n = 2 + r.int(2)
  let out = ''
  for (let i = 0; i < n; i++) {
    const cx = 18 + (124 * (i + r.range(0.1, 0.9))) / n
    const top = r.range(26, 46)
    const half = r.range(30, 46)
    const foot = 82
    const capY = top + (foot - top) * 0.26
    const capHalf = (half * (capY - top)) / (foot - top)
    out += `<path d="M${f(cx - half)} ${foot} L${f(cx)} ${f(top)} L${f(cx + half)} ${foot} Z" fill="${p.far}"/>`
    out += `<path d="M${f(cx - capHalf)} ${f(capY)} L${f(cx)} ${f(top)} L${f(cx + capHalf)} ${f(capY)} L${f(cx + capHalf * 0.35)} ${f(capY - 3)} L${f(cx - capHalf * 0.2)} ${f(capY + 1.5)} Z" fill="${p.farCap}" opacity="0.92"/>`
  }
  return out
}

function cloud(x: number, y: number, s: number): string {
  return (
    `<g fill="#ffffff" opacity="0.85">` +
    `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(9 * s)}" ry="${f(4.6 * s)}"/>` +
    `<ellipse cx="${f(x + 7 * s)}" cy="${f(y + 1.4 * s)}" rx="${f(7 * s)}" ry="${f(3.8 * s)}"/>` +
    `<ellipse cx="${f(x - 6 * s)}" cy="${f(y + 1.8 * s)}" rx="${f(6 * s)}" ry="${f(3.2 * s)}"/>` +
    `</g>`
  )
}

function tree(x: number, y: number, s: number, p: Palette): string {
  return (
    `<rect x="${f(x - 0.9 * s)}" y="${f(y - 4 * s)}" width="${f(1.8 * s)}" height="${f(5 * s)}" rx="${f(0.6 * s)}" fill="${p.accent}"/>` +
    `<ellipse cx="${f(x)}" cy="${f(y - 7.5 * s)}" rx="${f(4.6 * s)}" ry="${f(5.6 * s)}" fill="${p.accent}" opacity="0.9"/>`
  )
}

function birds(r: Rng, p: Palette): string {
  let out = ''
  const n = 2 + r.int(2)
  const x0 = r.range(30, 110)
  const y0 = r.range(18, 34)
  for (let i = 0; i < n; i++) {
    const x = x0 + i * r.range(7, 11)
    const y = y0 + r.range(-4, 4)
    const s = r.range(1.6, 2.4)
    out += `<path d="M${f(x - s * 1.6)} ${f(y)} q${f(s * 0.8)} ${f(-s)} ${f(s * 1.6)} 0 q${f(s * 0.8)} ${f(-s)} ${f(s * 1.6)} 0" fill="none" stroke="${p.accent}" stroke-width="0.9" stroke-linecap="round" opacity="0.75"/>`
  }
  return out
}

/** The painting markup (viewBox 0 0 160 120). */
export function paintingMarkup(seed: string): string {
  const r = createRng(`painting:${seed}`)
  const p = r.pick(PALETTES)
  const id = `pt${++uid}`
  const sunX = r.range(24, 136)
  const sunY = r.range(22, 40)
  const sunR = r.range(9, 13)
  const lake = r.next() < 0.3
  let out =
    `<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${p.skyTop}"/><stop offset="1" stop-color="${p.skyBottom}"/></linearGradient>` +
    `<radialGradient id="${id}g"><stop offset="0" stop-color="${p.sun}" stop-opacity="0.55"/><stop offset="1" stop-color="${p.sun}" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="160" height="120" fill="url(#${id}s)"/>` +
    `<circle cx="${f(sunX)}" cy="${f(sunY)}" r="${f(sunR * 2.4)}" fill="url(#${id}g)"/>` +
    `<circle cx="${f(sunX)}" cy="${f(sunY)}" r="${f(sunR)}" fill="${p.sun}"/>`
  const clouds = 1 + r.int(3)
  for (let i = 0; i < clouds; i++) out += cloud(r.range(14, 146), r.range(14, 42), r.range(0.7, 1.15))
  if (r.next() < 0.55) out += birds(r, p)
  out += mountains(r, p)
  out += `<path d="${hillPath(r, 86, 10, 3)}" fill="${p.mid}"/>`
  if (lake) {
    out +=
      `<path d="M0 96 Q40 90 80 94 T160 92 L160 120 L0 120 Z" fill="${p.skyTop}" opacity="0.9"/>` +
      `<path d="M14 101h22M52 106h30M98 100h26M120 109h22" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" opacity="0.6"/>` +
      `<path d="M0 120 L0 104 Q30 100 54 112 L62 120 Z" fill="${p.near}"/>`
  } else {
    out += `<path d="${hillPath(r, 104, 9, 2)}" fill="${p.near}"/>`
    if (r.next() < 0.6) {
      // A little winding path up the near hill.
      const x = r.range(50, 110)
      out += `<path d="M${f(x)} 120 C${f(x - 14)} 113 ${f(x + 16)} 108 ${f(x + 2)} 99" fill="none" stroke="${p.skyBottom}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="0.1 4.2" opacity="0.9"/>`
    }
  }
  const trees = r.int(3)
  for (let i = 0; i < trees; i++) out += tree(r.range(10, 150), r.range(104, 112), r.range(0.8, 1.2), p)
  return out
}

/** The painting as an <svg> that fills its box (decorative: the placard carries the words). */
export function painting(seed: string): SVGSVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  el.setAttribute('viewBox', '0 0 160 120')
  el.setAttribute('preserveAspectRatio', 'xMidYMid slice')
  el.setAttribute('aria-hidden', 'true')
  el.setAttribute('focusable', 'false')
  el.setAttribute('class', 'painting__svg')
  el.innerHTML = paintingMarkup(seed)
  return el
}
