/**
 * The web origin is shared with another family app, so every storage key and cache name must carry
 * the "upanyway:" prefix and we must never wipe shared storage. This scans every source file under
 * src/ for the ways that could go wrong.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CACHE_PREFIX, KEYS, PREFIX, SW_SKIP_WAITING } from '../../src/storage/keys'

const ROOT = join(__dirname, '..', '..')
const SRC = join(ROOT, 'src')
const CODE = /\.(ts|tsx|js|mjs|cjs)$/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (CODE.test(name)) out.push(full)
  }
  return out
}

/**
 * Blank out comments (keeping strings and line breaks) so doc comments like "never call
 * localStorage.clear()" don't count. Handles strings, template literals and regex literals.
 */
export function stripComments(src: string): string {
  let out = ''
  let i = 0
  let lastSignificant = ''
  const templateDepth: number[] = []
  const regexCanStart = (): boolean => lastSignificant === '' || /[(,=:[!&|?{};+\-*%<>~^]$/.test(lastSignificant) || /\b(return|typeof|case|do|else|in|of|void|yield|await)$/.test(lastSignificant)
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end < 0 ? src.length : end + 2
      out += src.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop
      continue
    }
    if (c === "'" || c === '"') {
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      out += src.slice(i, j + 1)
      lastSignificant = c
      i = j + 1
      continue
    }
    if (c === '`' || (c === '}' && templateDepth.length > 0 && templateDepth[templateDepth.length - 1] === 0)) {
      if (c === '}') templateDepth.pop()
      let j = i + 1
      while (j < src.length && src[j] !== '`' && !(src[j] === '$' && src[j + 1] === '{')) j += src[j] === '\\' ? 2 : 1
      if (src[j] === '$') {
        templateDepth.push(0)
        out += src.slice(i, j + 2)
        i = j + 2
        lastSignificant = '{'
      } else {
        out += src.slice(i, j + 1)
        i = j + 1
        lastSignificant = '`'
      }
      continue
    }
    if (c === '/' && regexCanStart()) {
      let j = i + 1
      let inClass = false
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') j += 2
        else if (src[j] === '[') (inClass = true), j++
        else if (src[j] === ']') (inClass = false), j++
        else if (src[j] === '/' && !inClass) break
        else j++
      }
      out += src.slice(i, j + 1)
      i = j + 1
      lastSignificant = '/regex'
      continue
    }
    if (templateDepth.length > 0) {
      if (c === '{') templateDepth[templateDepth.length - 1]++
      else if (c === '}') templateDepth[templateDepth.length - 1]--
    }
    out += c
    if (!/\s/.test(c)) lastSignificant = /[\w$]/.test(c) && /[\w$]/.test(src[i - 1] ?? '') ? lastSignificant + c : c
    i++
  }
  return out
}

const lineOf = (code: string, index: number): number => code.slice(0, index).split('\n').length

/** Every rule violation in one file's source. */
export function violations(source: string): string[] {
  const code = stripComments(source)
  const found: string[] = []
  const report = (index: number, what: string) => found.push(`line ${lineOf(code, index)}: ${what}`)

  // A literal key passed to any Storage method (keys must come from KEYS).
  for (const m of code.matchAll(/\.\s*(getItem|setItem|removeItem)\s*\(\s*['"`]/g)) {
    report(m.index ?? 0, `string literal key passed to ${m[1]}() — use KEYS from storage/keys`)
  }
  // Bracket or property access that stores data outside getItem/setItem.
  for (const m of code.matchAll(/\b(localStorage|sessionStorage)\s*\[/g)) {
    report(m.index ?? 0, `${m[1]}[…] access — use getItem/setItem with KEYS`)
  }
  for (const m of code.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*(\w+)/g)) {
    if (!['getItem', 'setItem', 'removeItem', 'key', 'length'].includes(m[2]) && m[2] !== 'clear') {
      report(m.index ?? 0, `${m[1]}.${m[2]} — use getItem/setItem with KEYS`)
    }
  }
  // Wiping shared storage.
  for (const m of code.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*clear\s*\(/g)) {
    report(m.index ?? 0, `${m[1]}.clear() wipes the other app's data too`)
  }
  // Cache names.
  for (const m of code.matchAll(/\bcaches\s*\.\s*open\s*\(\s*(['"`])([^'"`]*)/g)) {
    if (!m[2].startsWith(PREFIX)) report(m.index ?? 0, `caches.open('${m[2]}') without the ${PREFIX} prefix`)
  }
  for (const m of code.matchAll(/\bindexedDB\s*\.\s*open\s*\(\s*(['"`])([^'"`]*)/g)) {
    if (!m[2].startsWith(PREFIX)) report(m.index ?? 0, `indexedDB.open('${m[2]}') without the ${PREFIX} prefix`)
  }
  // caches.delete must be guarded by a startsWith(prefix) check in the same file.
  const del = code.search(/\bcaches\s*\.\s*delete\s*\(/)
  if (del >= 0 && !hasPrefixGuard(code)) {
    report(del, `caches.delete() without a startsWith('${PREFIX}…') guard in the same file`)
  }
  return found
}

/** Build-time placeholders that vite.config.ts fills from storage/keys.ts (sw-template.js). */
const KEY_PLACEHOLDERS = ['__PREFIX__', '__CACHE_PREFIX__']

function hasPrefixGuard(code: string): boolean {
  for (const m of code.matchAll(/\.startsWith\(\s*(?:(['"`])([^'"`]*)|([A-Za-z_$][\w$]*))/g)) {
    if (m[2] !== undefined && m[2].startsWith(PREFIX)) return true
    const ident = m[3]
    if (!ident) continue
    if (KEY_PLACEHOLDERS.includes(ident)) return true
    const defined = new RegExp(
      `\\b(?:const|let|var)\\s+${ident}\\s*=\\s*(?:['"\`]${PREFIX}|${KEY_PLACEHOLDERS.join('\\b|')}\\b)`,
    ).test(code)
    const imported = new RegExp(`import\\s*\\{[^}]*\\b${ident}\\b[^}]*\\}\\s*from\\s*['"][^'"]*storage/keys['"]`).test(code)
    if (defined || imported) return true
  }
  return false
}

describe('storage key scanner (self-check)', () => {
  it('flags the things it should', () => {
    const bad = [
      "localStorage.setItem('save', x)",
      'window.localStorage.getItem("state")',
      'sessionStorage.removeItem(`v1`)',
      'this.storage.setItem("upanyway:but-not-from-KEYS", "1")',
      "localStorage['save'] = '1'",
      'localStorage.save = data',
      'localStorage.clear()',
      'sessionStorage . clear ( )',
      "caches.open('v1')",
      "indexedDB.open('db')",
      'caches.keys().then((ns) => ns.forEach((n) => caches.delete(n)))',
      "const P = 'other:'; caches.keys().then((ns) => ns.filter((n) => n.startsWith(P)).map((n) => caches.delete(n)))",
      'const P = __VERSION__; caches.keys().then((ns) => ns.filter((n) => n.startsWith(P)).map((n) => caches.delete(n)))',
    ]
    for (const src of bad) expect(violations(src), src).not.toEqual([])
  })

  it('allows the safe patterns and ignores comments', () => {
    const good = [
      'storage.getItem(KEYS.save)',
      'localStorage.setItem(KEYS.backup, text)',
      'const n = localStorage.length',
      '// never call localStorage.clear() here',
      '/* localStorage.setItem("save", x) is banned */ const a = 1',
      "const url = 'https://example.com//x'; storage.getItem(KEYS.save)",
      "const re = /['\"]/g; storage.setItem(KEYS.save, s.replace(re, ''))",
      'const t = `a ${b ? `c` : "d"} e`; storage.getItem(KEYS.save)',
      "caches.open(CACHE); const PREFIX = 'upanyway:'; names.filter((n) => n.startsWith(PREFIX)).map((n) => caches.delete(n))",
      "import { CACHE_PREFIX } from '../storage/keys'\nnames.filter((n) => n.startsWith(CACHE_PREFIX)).map((n) => caches.delete(n))",
      "keys.filter((k) => k.startsWith('upanyway:precache:')).forEach((k) => caches.delete(k))",
      'const PREFIX = __PREFIX__\nnames.filter((n) => n.startsWith(PREFIX)).map((n) => caches.delete(n))',
      "caches.open('upanyway:precache:abc')",
    ]
    for (const src of good) expect(violations(src), src).toEqual([])
  })
})

describe('storage keys', () => {
  it('every key, cache prefix and message is prefixed "upanyway:"', () => {
    expect(PREFIX).toBe('upanyway:')
    for (const value of Object.values(KEYS)) expect(value.startsWith('upanyway:')).toBe(true)
    expect(new Set(Object.values(KEYS)).size).toBe(Object.values(KEYS).length)
    expect(CACHE_PREFIX.startsWith('upanyway:')).toBe(true)
    expect(SW_SKIP_WAITING.startsWith('upanyway:')).toBe(true)
  })

  it('no source file under src/ uses an unprefixed key, clears storage or deletes caches unguarded', () => {
    const files = walk(SRC)
    expect(files.length).toBeGreaterThan(10)
    const problems: string[] = []
    for (const file of files) {
      for (const v of violations(readFileSync(file, 'utf8'))) problems.push(`${relative(ROOT, file)} ${v}`)
    }
    expect(problems).toEqual([])
  })

  it('the service worker only deletes its own caches', () => {
    const sw = readFileSync(join(SRC, 'sw', 'sw-template.js'), 'utf8')
    expect(sw).toMatch(/caches\s*\.\s*delete/)
    expect(violations(sw)).toEqual([])
  })
})
