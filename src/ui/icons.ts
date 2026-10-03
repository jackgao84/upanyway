/**
 * Inline SVG icons, drawn in code. Rounded and friendly; most are two-tone from `currentColor`
 * (a soft tinted fill under a round stroke), so they take the colour of whatever holds them.
 * Weather icons (Fear Forecast 0–10) and the goat face are full colour.
 *
 * Markup shorthand (expanded once per icon): class="s" stroke only, class="f" tint fill only,
 * class="fs" tint fill + stroke, class="k" solid currentColor, class="d" dotted stroke.
 */

const LINE = { stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
const STYLES: Record<string, Record<string, string>> = {
  s: { fill: 'none', ...LINE },
  f: { fill: 'currentColor', 'fill-opacity': '0.2' },
  fs: { fill: 'currentColor', 'fill-opacity': '0.2', ...LINE },
  k: { fill: 'currentColor' },
  d: { fill: 'none', ...LINE, 'stroke-dasharray': '0.1 4' },
}

/** Replace each shorthand class with presentation attributes; attributes written on the tag win. */
function expand(markup: string): string {
  return markup.replace(/<(\w+)([^>]*?)\s*\/>/g, (_m, tag: string, attrs: string) => {
    const cls = /\sclass="(\w+)"/.exec(attrs)
    const preset = cls ? STYLES[cls[1]] : undefined
    if (!cls || !preset) return `<${tag}${attrs}/>`
    let rest = attrs.replace(cls[0], '')
    for (const [k, v] of Object.entries(preset)) {
      if (!new RegExp(`\\s${k}="`).test(rest)) rest += ` ${k}="${v}"`
    }
    return `<${tag}${rest}/>`
  })
}

const SPEAKER = '<path class="fs" d="M5.5 12.5h4l6-5.2v17.4l-6-5.2h-4A1.5 1.5 0 0 1 4 18v-4a1.5 1.5 0 0 1 1.5-1.5z"/>'

const ICONS = {
  'sound-on': `${SPEAKER}<path class="s" d="M20 12a5.6 5.6 0 0 1 0 8"/><path class="s" d="M23.6 8.6a10.4 10.4 0 0 1 0 14.8"/>`,
  'sound-off': `${SPEAKER}<path class="s" d="M21 12.6l6.4 6.8M27.4 12.6L21 19.4"/>`,
  back: '<path class="s" stroke-width="3.2" d="M19 7.5 10.5 16l8.5 8.5"/>',
  next: '<path class="s" stroke-width="3.2" d="M13 7.5 21.5 16 13 24.5"/>',
  close: '<path class="s" stroke-width="3.2" d="M9.5 9.5l13 13M22.5 9.5l-13 13"/>',
  plus: '<path class="s" stroke-width="3.2" d="M16 7.5v17M7.5 16h17"/>',
  minus: '<path class="s" stroke-width="3.2" d="M7.5 16h17"/>',
  check: '<path class="s" stroke-width="3.4" d="M7.5 16.5l5.8 5.8L24.5 10"/>',
  backspace:
    '<path class="fs" d="M12.2 7.5h13.3A2.5 2.5 0 0 1 28 10v12a2.5 2.5 0 0 1-2.5 2.5H12.2L4 16z"/><path class="s" d="M15.8 12.6l6.8 6.8M22.6 12.6l-6.8 6.8"/>',
  tent:
    '<path class="fs" d="M3.5 26.5 16 6l12.5 20.5z"/><path class="k" d="M16 13.5 11.6 26.5h8.8z" fill-opacity="0.75"/><path class="s" d="M2 26.5h28M16 6V2.8l3.6 1.6L16 6"/>',
  map:
    '<path class="fs" d="M4 8.2 11 5.5l10 3 7-2.7v18.7l-7 2.7-10-3-7 2.7z"/><path class="s" stroke-width="1.6" d="M11 5.5v18.7M21 8.5v18.7"/><path class="d" stroke-width="2" d="M7 20.5c2.6-.4 3.6-4.3 6.6-4.6 3-.3 4 2.7 6.6 1.7 2-.8 2.5-4.3 4.6-5.6"/>',
  mountain:
    '<path class="fs" d="M2.5 26.5 12 10.5l4.6 7.2 3.6-5.2 9.3 14z"/><path class="s" stroke-width="1.8" d="M9.4 14.9l2.6 1.6 2.2-1.9"/><circle class="fs" cx="23.5" cy="7.5" r="3"/>',
  stone:
    '<path class="fs" d="M5.8 20.8c-1.4-5.2 2.8-10 9.4-10.4 6.7-.4 11.6 3.1 11 8.6-.5 4.4-5 6.5-10.6 6.5S7 24.9 5.8 20.8z"/><path class="s" stroke-width="1.8" opacity="0.7" d="M11 15.2c1.6-1.3 3.6-1.8 5.6-1.8"/>',
  cairn:
    '<ellipse class="fs" cx="16" cy="24.6" rx="11.5" ry="3.9"/><ellipse class="fs" cx="15.4" cy="17.8" rx="8.2" ry="3.4"/><ellipse class="fs" cx="16.4" cy="11.6" rx="5.6" ry="2.9"/><ellipse class="fs" cx="15.8" cy="6.4" rx="3.2" ry="2.2"/>',
  letter:
    '<rect class="fs" x="4" y="8" width="24" height="17" rx="3"/><path class="s" d="M5.5 10.2 16 18l10.5-7.8"/>',
  wardrobe:
    '<path class="fs" d="M11.5 5.5 4.5 9.5l3 6 3-1.4V27h11V14.1l3 1.4 3-6-7-4c-.8 2-2.4 3-4.5 3s-3.7-1-4.5-3z"/>',
  badge:
    '<circle class="fs" cx="16" cy="16" r="12"/><circle class="s" stroke-width="1.5" stroke-dasharray="1.6 2.4" cx="16" cy="16" r="9.2"/><path class="s" stroke-width="2" d="M9.8 20.2 14 13.6l2.5 3.6 1.9-2.4 3.8 5.4z"/>',
  flops:
    '<rect class="fs" x="4" y="4.5" width="24" height="23" rx="2.5"/><rect class="s" stroke-width="1.6" x="8" y="8.5" width="16" height="15" rx="1"/><circle class="k" cx="16" cy="12.6" r="1.9"/><path class="s" stroke-width="1.7" d="M16 14.6v4.2M16 15.8l-4-2.6M16 15.8l4-2.6M16 18.8l-3.2 2.8M16 18.8l3.2 2.8"/>',
  weather:
    '<circle class="fs" cx="12" cy="11.5" r="4.6"/><path class="s" stroke-width="1.9" d="M12 3.2v1.6M4.3 11.5h1.6M6.6 6.1l1.1 1.1M17.4 6.1l-1.1 1.1"/><path class="fs" d="M10 26h13.5a4.6 4.6 0 0 0 .4-9.2 6.4 6.4 0 0 0-12.3 1.4A3.9 3.9 0 0 0 10 26z"/>',
  plans:
    '<rect class="fs" x="7.5" y="4" width="19" height="24" rx="2.5"/><path class="s" d="M4.5 9h4M4.5 14h4M4.5 19h4M4.5 24h4"/><path class="s" stroke-width="1.9" d="M12.5 10h9.5M12.5 15h9.5M12.5 20h6"/>',
  fog: '<path class="s" d="M4.5 11c2.4-1.8 4.6-1.8 7 0s4.6 1.8 7 0 4.6-1.8 7 0"/><path class="s" d="M7 17c2.4-1.8 4.6-1.8 7 0s4.6 1.8 7 0 4.6-1.8 7 0"/><path class="s" d="M4.5 23c2.4-1.8 4.6-1.8 7 0s4.6 1.8 7 0 4.6-1.8 7 0"/>',
  grownups:
    '<circle class="fs" cx="11" cy="9" r="3.8"/><path class="fs" d="M4 27v-3.8a7 7 0 0 1 14 0V27z"/><circle class="fs" cx="22.2" cy="11" r="3.2"/><path class="fs" d="M16.8 27v-3a5.7 5.7 0 0 1 11.4 0v3z"/>',
  share:
    '<path class="fs" d="M11 12.5H9.5a2.5 2.5 0 0 0-2.5 2.5v10a2.5 2.5 0 0 0 2.5 2.5h13a2.5 2.5 0 0 0 2.5-2.5V15a2.5 2.5 0 0 0-2.5-2.5H21"/><path class="s" d="M16 4v14.5M11.2 8.8 16 4l4.8 4.8"/>',
  download:
    '<path class="fs" d="M5 20.5V24a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3v-3.5"/><path class="s" d="M16 4.5v15M10.6 14.2 16 19.6l5.4-5.4"/>',
  upload:
    '<path class="fs" d="M5 20.5V24a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3v-3.5"/><path class="s" d="M16 19.6v-15M10.6 9.9 16 4.5l5.4 5.4"/>',
  copy: '<rect class="fs" x="10.5" y="10" width="15" height="17.5" rx="2.6"/><path class="s" d="M7 22V7.6A2.6 2.6 0 0 1 9.6 5H21"/>',
  trash:
    '<path class="fs" d="M8 9.5l1.4 16.4a2.2 2.2 0 0 0 2.2 2h8.8a2.2 2.2 0 0 0 2.2-2L24 9.5z"/><path class="s" d="M5.5 9.5h21M12.8 9.5V6.4h6.4v3.1M13.6 14v9M18.4 14v9"/>',
  pencil:
    '<path class="fs" d="M6 26l1.6-6.2L21 6.4a2.2 2.2 0 0 1 3.1 0l2.5 2.5a2.2 2.2 0 0 1 0 3.1L13.2 25.4z"/><path class="s" d="M18.6 8.8l4.6 4.6M7.6 19.8l4.6 4.6"/>',
  sun: '<circle class="fs" cx="16" cy="16" r="6"/><path class="s" d="M16 3.5v3M16 25.5v3M3.5 16h3M25.5 16h3M7.2 7.2l2.1 2.1M22.7 22.7l2.1 2.1M7.2 24.8l2.1-2.1M22.7 9.3l2.1-2.1"/>',
  moon: '<path class="fs" d="M25.6 19.6A10.6 10.6 0 1 1 12.4 6.4a8.4 8.4 0 0 0 13.2 13.2z"/>',
  idea: '<path class="fs" d="M16 4a8.2 8.2 0 0 0-4.6 15c.9.7 1.5 1.6 1.5 2.7h6.2c0-1.1.6-2 1.5-2.7A8.2 8.2 0 0 0 16 4z"/><path class="s" d="M13 25h6M14.2 28.4h3.6"/><path class="s" stroke-width="1.8" opacity="0.7" d="M12.6 11.2a4 4 0 0 1 3.4-2.6"/>',
  settings:
    '<path class="s" d="M5 9h22M5 16h22M5 23h22"/><circle class="k" cx="11" cy="9" r="3"/><circle class="k" cx="21" cy="16" r="3"/><circle class="k" cx="13.5" cy="23" r="3"/>',
  book: '<path class="fs" d="M16 8.4c-3.1-2-7-2.6-11-2v18.2c4-.6 7.9 0 11 2 3.1-2 7-2.6 11-2V6.4c-4-.6-7.9 0-11 2z"/><path class="s" d="M16 8.4v18"/>',
  rope: '<ellipse class="fs" cx="15" cy="12" rx="11" ry="6.2"/><ellipse class="s" cx="15" cy="12" rx="5.4" ry="2.6"/><path class="s" stroke-width="1.7" d="M8.6 7.2c1.3 3.1 1.3 6.5 0 9.6M21.4 7.2c-1.3 3.1-1.3 6.5 0 9.6"/><path class="s" d="M18 18c.8 3.6 3 6.2 6.6 8"/><circle class="k" cx="25.4" cy="26.4" r="1.7"/>',
  flag: '<path class="fs" d="M8.5 6h15l-3.6 5.2 3.6 5.2h-15"/><path class="s" d="M8.5 28V4.5"/>',
  eye: '<path class="fs" d="M3 16s5-8.6 13-8.6S29 16 29 16s-5 8.6-13 8.6S3 16 3 16z"/><circle class="k" cx="16" cy="16" r="4"/>',
  heart: '<path class="fs" d="M16 26.6S5 20.2 5 12.6a5.6 5.6 0 0 1 11-1.5 5.6 5.6 0 0 1 11 1.5c0 7.6-11 14-11 14z"/>',
  info: '<circle class="fs" cx="16" cy="16" r="12"/><path class="s" stroke-width="2.8" d="M16 15v7.5"/><circle class="k" cx="16" cy="10.3" r="1.8"/>',
  undo: '<path class="s" d="M10 9.5 5.5 14l4.5 4.5"/><path class="s" d="M6 14h12.5a7 7 0 0 1 0 14H12"/>',

  // Badge icons (courage + attempts only)
  whipper:
    '<circle class="s" stroke-width="2" cx="18" cy="4.6" r="2.2"/><path class="s" stroke-width="2" d="M18 6.8c.4 6.4-2.2 11.6-8.2 14.8"/><circle class="fs" cx="6.8" cy="18.4" r="2.7"/><path class="s" stroke-width="2.1" d="M8.6 20.8l2.2 4.8M9.4 22.4l-4.6 1.4M9.6 22l3.6-2.6M10.8 25.6l-2.6 3.6M10.8 25.6l3.8 2.4"/><path class="s" stroke-width="1.8" opacity="0.6" d="M20.6 21.4c1.8.9 3.8 1 5.8.4M19.6 25.8c1.8.7 3.6.7 5.4.1"/>',
  attempts:
    '<ellipse class="f" cx="16" cy="16" rx="13.5" ry="10.5"/><path class="s" stroke-width="2.6" d="M8 8.5v15M12.6 8.5v15M17.2 8.5v15M21.8 8.5v15M5.2 20.6l21.6-9.2"/>',
  bigleap:
    '<path class="fs" d="M2.5 28.5V19h8.2l1.8 9.5z"/><path class="fs" d="M20.5 28.5 22.6 14h7v14.5z"/><path class="d" stroke-width="2.6" d="M7.2 15.6c2.6-8.6 11-11 16.4-4.2"/><path class="s" stroke-width="2" d="M23.6 11.4l-.2-3.2M23.6 11.4l-3.1-.7"/>',
  oops:
    '<path class="fs" d="M6.5 4h6.4v10.4l3 5.2a3.6 3.6 0 0 1-6.2 3.6l-3.2-5.6z"/><path class="s" stroke-width="1.7" d="M6.6 7.6h6.2M6.6 10.8h6.2"/><path class="fs" d="M17.6 8h6.4v10.4l3 5.2a3.6 3.6 0 0 1-6.2 3.6l-3.2-5.6z"/><circle class="k" cx="20.8" cy="12.4" r="1.2"/><circle class="k" cx="20.8" cy="16.4" r="1.2"/>',
  stillhere:
    '<path class="s" d="M4 26.5h24"/><path class="s" d="M16 26.5v-10"/><path class="fs" d="M16 19.4c-5.2 0-8.6-3-8.6-7.6 5.2 0 8.6 3 8.6 7.6z"/><path class="fs" d="M16 16.4c0-4.4 3.2-7.8 8.6-7.8 0 4.6-3.4 7.8-8.6 7.8z"/><path class="s" stroke-width="1.6" opacity="0.6" d="M11 26.5l2-2.6M21 26.5l-1.6-2.2"/>',
  smaller:
    '<path class="fs" d="M4 27h24V8.5h-8v6h-8v6.2H4z"/><path class="s" stroke-width="1.8" d="M7.2 20.7V16M7.2 16l3 1.4-3 1.4"/>',
  beta:
    '<path class="fs" d="M6.5 5.5h19a3.2 3.2 0 0 1 3.2 3.2v11a3.2 3.2 0 0 1-3.2 3.2H14l-6.2 5v-5H6.5a3.2 3.2 0 0 1-3.2-3.2v-11a3.2 3.2 0 0 1 3.2-3.2z"/><path class="d" stroke-width="2.6" d="M8.5 18c1.6-5.6 7.2-8 12.2-4.6"/><circle class="k" cx="23" cy="15.6" r="1.8"/>',
  stormy:
    '<circle class="fs" cx="22.6" cy="10" r="4.4"/><path class="s" stroke-width="1.8" d="M22.6 2.6v1.4M29.6 10h-1.4M27.6 5l-1 1"/><path class="fs" d="M8.2 22.4h12.4a4.4 4.4 0 0 0 .4-8.8 6.2 6.2 0 0 0-11.9 1.4 3.7 3.7 0 0 0-.9 7.4z"/><path class="s" d="M13.2 22.4l-2.2 3.6h3.6l-1.8 3.6"/>',
} as const

export type IconName = keyof typeof ICONS | 'goat'

export const ICON_NAMES = [...Object.keys(ICONS), 'goat'] as IconName[]

/** Badge ids → icon names (the badge screen and toasts use these). */
export const BADGE_ICONS: Record<string, IconName> = {
  'first-whipper': 'whipper',
  'attempts-10': 'attempts',
  'attempts-50': 'attempts',
  'attempts-100': 'attempts',
  'big-leap': 'bigleap',
  oops: 'oops',
  'still-here': 'stillhere',
  'smaller-step': 'smaller',
  beta: 'beta',
  'stormy-5': 'stormy',
}

const GOAT = `
  <path d="M10 13.4c-2.7 0-5.5-1.2-7.1-3.2 2.6-1.1 5.8-.7 7.9 1.2z" fill="#fbe5d8" stroke="#5b4038" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M22 13.4c2.7 0 5.5-1.2 7.1-3.2-2.6-1.1-5.8-.7-7.9 1.2z" fill="#fbe5d8" stroke="#5b4038" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M5.2 10.6c1.4.2 2.8.6 3.9 1.3" fill="none" stroke="#f2a9a0" stroke-width="1.1" stroke-linecap="round"/>
  <path d="M26.8 10.6c-1.4.2-2.8.6-3.9 1.3" fill="none" stroke="#f2a9a0" stroke-width="1.1" stroke-linecap="round"/>
  <path d="M12.5 9c-1.4-1.8-1.9-4-1.3-6.2 1.1 1.5 2.5 3 4 4.6z" fill="#dcb68e" stroke="#5b4038" stroke-width="1.1" stroke-linejoin="round"/>
  <path d="M11.7 5.6l1.3-.5M12.2 7.2l1.2-.5" stroke="#a7825e" stroke-width="0.8" stroke-linecap="round"/>
  <path d="M19.5 9c1.4-1.8 1.9-4 1.3-6.2-1.1 1.5-2.5 3-4 4.6z" fill="#dcb68e" stroke="#5b4038" stroke-width="1.1" stroke-linejoin="round"/>
  <path d="M20.3 5.6l-1.3-.5M19.8 7.2l-1.2-.5" stroke="#a7825e" stroke-width="0.8" stroke-linecap="round"/>
  <path d="M14.5 23.2c.1 1.7.7 3.2 1.5 4 .8-.8 1.4-2.3 1.5-4z" fill="#ffffff" stroke="#5b4038" stroke-width="1.1" stroke-linejoin="round"/>
  <path d="M9.7 13.2c0-4.3 2.8-6.7 6.3-6.7s6.3 2.4 6.3 6.7c0 3.1-.6 5.6-1.8 7.6-1.1 1.9-2.6 3-4.5 3s-3.4-1.1-4.5-3c-1.2-2-1.8-4.5-1.8-7.6z" fill="#fffaf3" stroke="#5b4038" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M11.6 10.6a2.2 2.2 0 0 1 2.5-2.8 2.3 2.3 0 0 1 3.8 0 2.2 2.2 0 0 1 2.5 2.8c-.8.6-2 .5-2.7-.2-.9.7-2.5.7-3.4 0-.7.7-1.9.8-2.7.2z" fill="#ffffff" stroke="#5b4038" stroke-width="1.05" stroke-linejoin="round"/>
  <ellipse cx="13.3" cy="14.7" rx="1.55" ry="1.85" fill="#3d2a24"/>
  <ellipse cx="18.7" cy="14.7" rx="1.55" ry="1.85" fill="#3d2a24"/>
  <circle cx="13.8" cy="14.1" r="0.6" fill="#ffffff"/>
  <circle cx="19.2" cy="14.1" r="0.6" fill="#ffffff"/>
  <ellipse cx="11.3" cy="17.6" rx="1.4" ry="0.9" fill="#f4a3a0" opacity="0.7"/>
  <ellipse cx="20.7" cy="17.6" rx="1.4" ry="0.9" fill="#f4a3a0" opacity="0.7"/>
  <ellipse cx="16" cy="19.5" rx="2.7" ry="2" fill="#fbe0d6"/>
  <path d="M15 18.7h2l-1 1.1z" fill="#b8706a" stroke="#b8706a" stroke-width="0.6" stroke-linejoin="round"/>
  <path d="M14.9 20.7c.6.5 1.6.5 2.2 0" fill="none" stroke="#5b4038" stroke-width="0.9" stroke-linecap="round"/>`

const cache = new Map<string, string>()

function markupFor(name: IconName): string {
  let m = cache.get(name)
  if (m === undefined) {
    m = name === 'goat' ? GOAT : expand(ICONS[name])
    cache.set(name, m)
  }
  return m
}

function makeSvg(markup: string, size: number, cls: string): SVGSVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  el.setAttribute('viewBox', '0 0 32 32')
  el.setAttribute('width', String(size))
  el.setAttribute('height', String(size))
  el.setAttribute('aria-hidden', 'true')
  el.setAttribute('focusable', 'false')
  el.setAttribute('class', cls)
  el.innerHTML = markup
  return el
}

/** An icon as an inline <svg> (decorative: aria-hidden; label the control that holds it). */
export function icon(name: IconName, size = 28): SVGSVGElement {
  return makeSvg(markupFor(name), size, `icon icon--${name}`)
}

export function hasIcon(name: string): name is IconName {
  return name === 'goat' || Object.prototype.hasOwnProperty.call(ICONS, name)
}

// ---------------------------------------------------------------------------------------------
// Weather icons for the Fear Forecast: 0 = sunny … 10 = thunderstorm.

export const WEATHER_LABELS = [
  'Sunny',
  'Mostly sunny',
  'A few clouds',
  'Partly cloudy',
  'Cloudy',
  'Grey skies',
  'Drizzly',
  'Rainy',
  'Pouring',
  'Stormy',
  'Thunderstorm',
] as const

/** Kid-friendly name for a fear level 0–10 (clamped, rounded). */
export function weatherLabel(level: number): string {
  return WEATHER_LABELS[clampLevel(level)]
}

function clampLevel(level: number): number {
  return Math.max(0, Math.min(10, Math.round(Number.isFinite(level) ? level : 0)))
}

const CLOUD = 'M5 12h11a4 4 0 0 0 .4-7.98A5.5 5.5 0 0 0 6 3.4 4.3 4.3 0 0 0 5 12z'

function sun(cx: number, cy: number, r: number, rays: boolean): string {
  let s = ''
  if (rays) {
    const r1 = r + 2.4
    const r2 = r + 4.6
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      const x1 = (cx + Math.cos(a) * r1).toFixed(2)
      const y1 = (cy + Math.sin(a) * r1).toFixed(2)
      const x2 = (cx + Math.cos(a) * r2).toFixed(2)
      const y2 = (cy + Math.sin(a) * r2).toFixed(2)
      s += `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#f2a33a" stroke-width="2" stroke-linecap="round"/>`
    }
  }
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#f9c54a" stroke="#e8962e" stroke-width="1.4"/>`
  s += `<path d="M${cx - r * 0.5} ${cy - r * 0.15}a${r * 0.55} ${r * 0.55} 0 0 1 ${r * 0.45}-${r * 0.38}" fill="none" stroke="#fff3c4" stroke-width="1.3" stroke-linecap="round"/>`
  return s
}

function cloud(x: number, y: number, scale: number, fill: string, stroke = '#8f98ab'): string {
  return `<path transform="translate(${x} ${y}) scale(${scale})" d="${CLOUD}" fill="${fill}" stroke="${stroke}" stroke-width="${(1.3 / scale).toFixed(2)}" stroke-linejoin="round"/>`
}

function drops(points: [number, number][], len: number, color = '#4b93d6'): string {
  return points
    .map(
      ([x, y]) =>
        `<path d="M${x} ${y}l${(-len * 0.35).toFixed(2)} ${len}" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>`,
    )
    .join('')
}

function bolt(x: number, y: number, s: number): string {
  return `<path transform="translate(${x} ${y}) scale(${s})" d="M4.5 0 0 7.5h3.6L2 14l7-9H5.2L7.5 0z" fill="#ffd34d" stroke="#d9951b" stroke-width="${(1.1 / s).toFixed(2)}" stroke-linejoin="round"/>`
}

const WEATHER: string[] = [
  sun(16, 16, 7, true),
  sun(13.5, 13.5, 6.2, true) + cloud(15.5, 18.4, 0.68, '#ffffff'),
  sun(12.5, 12, 5.8, true) + cloud(10.5, 15.6, 0.9, '#ffffff'),
  sun(11.5, 11, 5.6, true) + cloud(5.2, 12.6, 1.1, '#fbfbfd'),
  sun(22.5, 9.5, 4.2, false) + cloud(3.4, 10.6, 1.22, '#eef0f4'),
  cloud(10.4, 5.8, 0.92, '#c9cfda') + cloud(2.6, 12, 1.2, '#e2e6ed'),
  cloud(3.6, 5.4, 1.22, '#dde2ea') + drops([[12, 23], [19.5, 23]], 4.2),
  cloud(3.6, 5, 1.22, '#cdd4df') + drops([[10.5, 22.4], [16.5, 23.6], [22.5, 22.4]], 5),
  cloud(3.6, 4.4, 1.22, '#aeb7c6', '#7b8599') + drops([[9, 21.6], [13.6, 23.4], [18.2, 21.6], [22.8, 23.4]], 6.2, '#3f84c7'),
  cloud(3.6, 4, 1.22, '#959fb2', '#6c7589') + drops([[9, 21.4], [22.6, 21.4]], 6, '#3f84c7') + bolt(12.6, 17.4, 0.92),
  cloud(9.8, 2.6, 0.85, '#7f889b', '#5f6779') +
    cloud(2.4, 6, 1.24, '#868fa2', '#5f6779') +
    drops([[7.8, 23.2], [24.6, 22.4]], 5.6, '#3f84c7') +
    bolt(11.4, 18.6, 1.12),
]

/** Fear Forecast icon for level 0–10: sun → sun + cloud → cloud → rain → pouring → thunderstorm. */
export function weatherIcon(level: number, size = 40): SVGSVGElement {
  const n = clampLevel(level)
  return makeSvg(WEATHER[n], size, `icon icon--weather icon--weather-${n}`)
}

/** Soft background tint for a fear level (warm sunny yellow → cool storm grey). */
export function weatherTint(level: number): string {
  const t = clampLevel(level) / 10
  const from = [255, 240, 196]
  const to = [214, 221, 236]
  const c = from.map((v, i) => Math.round(v + (to[i] - v) * t))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}
