#!/usr/bin/env node
/**
 * Release check: no unfinished work in the shipped game or its tests.
 * Fails on TODO / FIXME / XXX / lorem / ipsum / "coming soon" / TBD / "to fill in", focused or skipped
 * tests, and empty content lists in src/content. Every "placeholder" hit is listed for a human to judge:
 * HTML input placeholder= attributes are legitimate; anything else is a defect.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIRS = ['src', 'tests', 'e2e', 'scripts', 'public']
const FILES = ['index.html', 'README.md', 'DEPLOY.md']
const SKIP = new Set(['node_modules', 'dist', '.brief', '.git', 'test-results', 'playwright-report'])
const TEXT = /\.(ts|js|mjs|css|html|json|webmanifest|md)$/
const SELF = 'scripts/check-stubs.mjs'

const STUB = /\b(TODO|FIXME|XXX|TBD)\b|lorem|ipsum|coming soon|to fill in/i
// .only anywhere; .skip/.todo only when unconditional (a named test or block skipped outright). A
// per-device `test.skip(condition, reason)` inside a test is a legitimate project filter.
const FOCUS = /\b(test|it|describe)\.only\(|\b(test|it|describe)\.(skip|todo)\(\s*['"`]|\bdescribe\.skip\(/

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (TEXT.test(name)) out.push(full)
  }
  return out
}

const files = [...DIRS.flatMap((d) => walk(join(ROOT, d), [])), ...FILES.map((f) => join(ROOT, f))]
const defects = []
const placeholders = []

for (const file of files) {
  const rel = relative(ROOT, file)
  if (rel === SELF) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (STUB.test(line)) defects.push(`${rel}:${i + 1}: ${line.trim()}`)
    if (FOCUS.test(line)) defects.push(`${rel}:${i + 1}: focused/skipped test: ${line.trim()}`)
    if (/placeholder/i.test(line)) placeholders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`)
  })
}

// Empty content lists: `export const X = []` or `= {}` in src/content.
for (const file of walk(join(ROOT, 'src/content'), [])) {
  const rel = relative(ROOT, file)
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (/export const \w+[^=]*=\s*(\[\s*\]|\{\s*\})\s*(as const)?\s*;?\s*$/.test(line)) {
      defects.push(`${rel}:${i + 1}: empty content list: ${line.trim()}`)
    }
  })
}

console.log(`Scanned ${files.length} files.`)
if (placeholders.length) {
  console.log(`\n"placeholder" mentions to judge by hand (${placeholders.length}):`)
  for (const p of placeholders) console.log('  ' + p)
}
if (defects.length) {
  console.log(`\nDEFECTS (${defects.length}):`)
  for (const d of defects) console.log('  ' + d)
  process.exit(1)
}
console.log('\nNo TODO/FIXME/lorem/"coming soon"/TBD, no focused or skipped tests, no empty content lists.')
