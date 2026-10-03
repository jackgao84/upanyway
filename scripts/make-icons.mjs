/**
 * Renders the app icon (drawn entirely in Canvas 2D code) in headless WebKit — the browser the
 * e2e suite already installs — and writes public/icons/*.png. Run `npm run icons` after changing the art.
 *
 *   icon-180.png           apple-touch-icon: full-bleed square (iOS rounds the corners itself)
 *   icon-192.png / -512    "any": rounded square with transparent corners
 *   icon-maskable-512.png  full-bleed; the goat and backpack sit inside the central 80% safe zone
 */
import { webkit } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const ICONS = [
  { file: 'icon-180.png', size: 180, kind: 'square' },
  { file: 'icon-192.png', size: 192, kind: 'rounded' },
  { file: 'icon-512.png', size: 512, kind: 'rounded' },
  { file: 'icon-maskable-512.png', size: 512, kind: 'maskable' },
]

/**
 * Runs in the browser, so it must be self-contained. The scene is authored in a 0..1 unit
 * square (y down): sunrise sky, paper-cut ranges, and a baby mountain goat peeking out of a backpack.
 * @param {{ size: number, kind: 'square' | 'rounded' | 'maskable' }} opts
 */
function render({ size, kind }) {
  const C = {
    skyTop: '#e49fbb',
    skyMid: '#f7b49a',
    skyLow: '#fcd99c',
    sun: '#fff3cf',
    cloud: '#fff4ea',
    snow: '#fff6ee',
    back: '#eba69f',
    mid: '#cf7f8e',
    front: '#8f4f72',
    paperShadow: 'rgba(84, 34, 62, 0.32)',
    pack: '#2f8c87',
    packDark: '#236f6c',
    packLight: '#3fa39c',
    packInside: '#1a4648',
    buckle: '#f6c35b',
    fur: '#fffaf3',
    furShade: '#ead3c2',
    muzzle: '#fde6dd',
    earInside: '#f5a9bb',
    horn: '#7a5960',
    hornLight: '#9a7a7c',
    hoof: '#6a4a52',
    eye: '#35202f',
    nose: '#ee86a2',
    cheek: 'rgba(245, 140, 165, 0.55)',
    ink: '#4e2b3f',
  }

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.scale(size, size)

  const circle = (x, y, r) => {
    ctx.moveTo(x + r, y)
    ctx.arc(x, y, r, 0, Math.PI * 2)
  }
  const ellipse = (x, y, rx, ry, rot = 0) => {
    ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot))
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  }
  const roundRect = (x, y, w, h, r) => {
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
  const fill = (color, build) => {
    ctx.beginPath()
    build()
    ctx.fillStyle = color
    ctx.fill()
  }
  /** A cut-paper layer: a soft shadow around its edge falls on whatever is behind it. */
  const paper = (color, build, lift = 1, dy = -0.004) => {
    ctx.save()
    ctx.shadowColor = C.paperShadow
    ctx.shadowBlur = 0.028 * size * lift
    ctx.shadowOffsetY = dy * size * lift
    fill(color, build)
    ctx.restore()
  }
  /** Mountain ridge through `pts` with rounded peaks, closed along the bottom. */
  const ridge = (pts, r) => () => {
    ctx.moveTo(-0.1, 1.1)
    ctx.lineTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length - 1; i++) ctx.arcTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r)
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
    ctx.lineTo(1.1, 1.1)
    ctx.closePath()
  }

  if (kind === 'rounded') {
    ctx.beginPath()
    roundRect(0, 0, 1, 1, 0.22)
    ctx.clip()
  }

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, 1)
  sky.addColorStop(0, C.skyTop)
  sky.addColorStop(0.42, C.skyMid)
  sky.addColorStop(0.7, C.skyLow)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, 1, 1)

  // Sun rising in the saddle between the two big peaks, right behind the goat's head
  const glow = ctx.createRadialGradient(0.5, 0.5, 0.12, 0.5, 0.5, 0.5)
  glow.addColorStop(0, 'rgba(255, 246, 214, 0.95)')
  glow.addColorStop(0.45, 'rgba(255, 233, 186, 0.45)')
  glow.addColorStop(1, 'rgba(255, 225, 170, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 1, 1)
  fill(C.sun, () => circle(0.5, 0.5, 0.235))

  const cloud = (x, y, s) =>
    paper(
      C.cloud,
      () => {
        circle(x - 0.05 * s, y + 0.01 * s, 0.04 * s)
        circle(x + 0.005 * s, y - 0.015 * s, 0.055 * s)
        circle(x + 0.06 * s, y + 0.01 * s, 0.04 * s)
        roundRect(x - 0.09 * s, y + 0.005 * s, 0.19 * s, 0.045 * s, 0.022 * s)
      },
      0.6,
    )
  cloud(0.17, 0.17, 1)
  cloud(0.86, 0.1, 0.8)

  // Back range: two big snowy peaks
  const back = ridge(
    [
      [-0.05, 0.52],
      [0.2, 0.25],
      [0.36, 0.43],
      [0.5, 0.6],
      [0.62, 0.48],
      [0.8, 0.21],
      [1.05, 0.48],
    ],
    0.035,
  )
  paper(C.back, back, 1)
  ctx.save()
  ctx.beginPath()
  back()
  ctx.clip()
  const snowCap = (px, py, depth) =>
    fill(C.snow, () => {
      ctx.rect(px - 0.2, py - 0.1, 0.4, 0.1 + depth)
      for (let i = -3; i <= 3; i++) circle(px + i * 0.036, py + depth + (i % 2 ? 0.006 : -0.004), 0.024)
    })
  snowCap(0.2, 0.25, 0.06)
  snowCap(0.8, 0.21, 0.065)
  ctx.restore()

  // Middle and front ranges
  paper(
    C.mid,
    ridge(
      [
        [-0.05, 0.47],
        [0.08, 0.43],
        [0.3, 0.62],
        [0.5, 0.74],
        [0.7, 0.6],
        [0.9, 0.41],
        [1.05, 0.49],
      ],
      0.06,
    ),
    1.1,
  )
  paper(
    C.front,
    ridge(
      [
        [-0.05, 0.66],
        [0.12, 0.6],
        [0.3, 0.74],
        [0.5, 0.82],
        [0.7, 0.72],
        [0.88, 0.6],
        [1.05, 0.64],
      ],
      0.08,
    ),
    1.2,
  )

  // Goat in a backpack. The maskable icon shrinks this group into the 80% safe zone.
  ctx.save()
  const s = kind === 'maskable' ? 0.8 : 1
  ctx.translate(0.5, 0.64)
  ctx.scale(s, s)
  ctx.translate(-0.5, -0.64)

  // Backpack opening (behind the goat)
  fill(C.packInside, () => ellipse(0.5, 0.72, 0.3, 0.06))

  // Floppy ears, sticking out sideways and drooping a little
  for (const side of [-1, 1]) {
    const ex = 0.5 + side * 0.2
    const rot = side * 0.38
    paper(C.fur, () => ellipse(ex, 0.47, 0.1, 0.05, rot), 0.5)
    fill(C.earInside, () => ellipse(ex + side * 0.01, 0.474, 0.066, 0.026, rot))
  }

  // Tiny horn nubs, tilted outwards
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(0.5 + side * 0.066, 0.41)
    ctx.rotate(side * 0.32)
    paper(
      C.horn,
      () => {
        ctx.moveTo(-0.03, 0)
        ctx.quadraticCurveTo(-0.03, -0.062, 0, -0.07)
        ctx.quadraticCurveTo(0.03, -0.062, 0.03, 0)
        ctx.closePath()
      },
      0.4,
    )
    fill(C.hornLight, () => roundRect(-0.017, -0.043, 0.034, 0.012, 0.006))
    ctx.restore()
  }

  // Fluffy head: soft fur puffs around the cheeks and a little forelock on top
  const head = (dy) => () => {
    ellipse(0.5, 0.54 + dy, 0.158, 0.155)
    for (let a = -10; a <= 190; a += 20) {
      const t = (a * Math.PI) / 180
      circle(0.5 + Math.cos(t) * 0.15, 0.55 + dy + Math.sin(t) * 0.13, 0.036)
    }
    circle(0.475, 0.395 + dy, 0.034)
    circle(0.508, 0.382 + dy, 0.04)
    circle(0.54, 0.398 + dy, 0.028)
  }
  ctx.save()
  ctx.shadowColor = 'rgba(84, 34, 62, 0.35)'
  ctx.shadowBlur = 0.03 * size
  ctx.shadowOffsetY = 0.006 * size
  fill(C.furShade, head(0.012))
  ctx.restore()
  fill(C.fur, head(0))

  // Long goat muzzle, cheeks, nose, smile
  fill(C.muzzle, () => ellipse(0.5, 0.628, 0.078, 0.062))
  fill(C.cheek, () => {
    ellipse(0.383, 0.6, 0.036, 0.023)
    ellipse(0.617, 0.6, 0.036, 0.023)
  })
  fill(C.nose, () => {
    ctx.moveTo(0.47, 0.6)
    ctx.quadraticCurveTo(0.5, 0.59, 0.53, 0.6)
    ctx.quadraticCurveTo(0.532, 0.612, 0.5, 0.63)
    ctx.quadraticCurveTo(0.468, 0.612, 0.47, 0.6)
  })
  ctx.strokeStyle = C.ink
  ctx.lineWidth = 0.013
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0.5, 0.63)
  ctx.quadraticCurveTo(0.488, 0.652, 0.472, 0.644)
  ctx.moveTo(0.5, 0.63)
  ctx.quadraticCurveTo(0.512, 0.652, 0.528, 0.644)
  ctx.stroke()

  // Big shiny eyes
  for (const side of [-1, 1]) {
    const ex = 0.5 + side * 0.072
    fill(C.eye, () => ellipse(ex, 0.528, 0.043, 0.049))
    fill('#ffffff', () => circle(ex + 0.014, 0.511, 0.017))
    fill('#ffffff', () => circle(ex - 0.016, 0.549, 0.008))
  }

  // Backpack: body, front pocket, strap + buckle, rolled cuff
  paper(C.pack, () => roundRect(0.17, 0.74, 0.66, 0.42, 0.09), 1)
  fill(C.packLight, () => roundRect(0.25, 0.84, 0.5, 0.3, 0.08))
  fill(C.packDark, () => roundRect(0.455, 0.77, 0.09, 0.14, 0.03))
  fill(C.buckle, () => roundRect(0.435, 0.85, 0.13, 0.075, 0.025))
  fill(C.packDark, () => roundRect(0.47, 0.871, 0.06, 0.032, 0.012))
  paper(C.packDark, () => roundRect(0.14, 0.69, 0.72, 0.1, 0.05), 0.7, 0.004)
  fill(C.pack, () => roundRect(0.17, 0.703, 0.66, 0.026, 0.013))

  // Little front legs hooked over the cuff
  for (const side of [-1, 1]) {
    const lx = 0.5 + side * 0.14
    paper(C.fur, () => roundRect(lx - 0.042, 0.645, 0.084, 0.1, 0.04), 0.5)
    fill(C.hoof, () => roundRect(lx - 0.042, 0.712, 0.084, 0.045, 0.02))
    fill(C.packDark, () => roundRect(lx - 0.006, 0.728, 0.012, 0.034, 0.006))
  }
  ctx.restore()

  return canvas.toDataURL('image/png')
}

const browser = await webkit.launch({ headless: true })
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  await page.setContent('<!doctype html><html><body></body></html>')
  mkdirSync(OUT, { recursive: true })
  for (const icon of ICONS) {
    const dataUrl = await page.evaluate(render, { size: icon.size, kind: icon.kind })
    const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
    writeFileSync(join(OUT, icon.file), png)
    console.log(`wrote public/icons/${icon.file} (${icon.size}x${icon.size}, ${png.length} bytes)`)
  }
} finally {
  await browser.close()
}
