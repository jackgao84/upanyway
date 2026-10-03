/**
 * Until the Sky Lake finale the goat is only ever drawn in (or peeking out of) the backpack. The art
 * can draw it on its own hooves (`inBackpack: false`), so this scans src/ for every place that does
 * and allows only the finale itself and the climb's night goat — which the climb screen turns on
 * only once the goat is out (model/unlocks isGoatOut).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const SRC = join(ROOT, 'src')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.ts$/.test(name)) out.push(full)
  }
  return out
}

/** Source without its comments (doc comments may well say "inBackpack: false"). */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Files allowed to draw the goat out of the pack, and why. */
const ALLOWED = new Map<string, string>([
  ['src/game/render/finale.ts', 'the finale: the goat climbs out for the first time'],
  ['src/screens/finale/timeline.ts', 'the finale timeline'],
  ['src/game/render/character.ts', 'the night goat, only when the stage is made with goatOutside'],
])

describe('the goat stays in the backpack until Sky Lake', () => {
  const files = walk(SRC).map((f) => ({ path: relative(ROOT, f).split('\\').join('/'), code: code(readFileSync(f, 'utf8')) }))

  it('only the finale and the night goat draw it out of the pack', () => {
    const found = files.filter((f) => /inBackpack:\s*false/.test(f.code) && !ALLOWED.has(f.path)).map((f) => f.path)
    expect(found).toEqual([])
  })

  it('the climb only lets the goat out once isGoatOut says so', () => {
    const play = files.find((f) => f.path === 'src/screens/climb/play.ts')
    expect(play?.code).toMatch(/goatOutside\s*=\s*this\.night\s*&&\s*isGoatOut\(/)
    // Every other screen that makes a climb stage (the first-run lesson) keeps the goat in the pack.
    for (const f of files) {
      if (!f.path.startsWith('src/screens/') || f.path.startsWith('src/screens/climb/')) continue
      for (const m of f.code.matchAll(/goatOutside:\s*([^,}\n]+)/g)) expect(`${f.path}: ${m[1].trim()}`).toBe(`${f.path}: false`)
    }
  })
})
