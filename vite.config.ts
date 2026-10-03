import { defineConfig, type Plugin, type ResolvedConfig } from 'vite'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { CACHE_PREFIX, PREFIX, SW_SKIP_WAITING } from './src/storage/keys'

/**
 * GitHub Pages serves this repo at /<repo>/. Override with VITE_BASE=/other/ if the repo is renamed.
 * An empty VITE_BASE (an unset CI variable) falls back to the default.
 */
function base(): string {
  const raw = (process.env.VITE_BASE || '/upanyway/').trim()
  return ('/' + raw + '/').replace(/\/{2,}/g, '/')
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

/** Replaces every `__NAME__` placeholder; fails the build if one is missing or left over. */
function fillTemplate(source: string, values: Record<string, string>): string {
  const out = source.replace(/__([A-Z_]+)__/g, (match, name: string) => {
    if (!(name in values)) throw new Error(`sw-template.js: unknown placeholder ${match}`)
    return values[name]
  })
  for (const name of Object.keys(values)) {
    if (!source.includes(`__${name}__`)) throw new Error(`sw-template.js: missing placeholder __${name}__`)
  }
  return out
}

/**
 * Emits dist/sw.js from src/sw/sw-template.js with the full precache list and a content hash.
 * Cache names and the skip-waiting message come from src/storage/keys.ts (shared-origin rule).
 */
function serviceWorker(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'upanyway-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) {
      config = resolved
    },
    generateBundle(_options, bundle) {
      if (!CACHE_PREFIX.startsWith(PREFIX)) throw new Error('CACHE_PREFIX must start with PREFIX')
      const templatePath = resolve(config.root, 'src/sw/sw-template.js')
      const template = readFileSync(templatePath, 'utf8')
      const hash = createHash('sha256')
      hash.update(template)

      const bundled = Object.keys(bundle).sort()
      if (!bundled.includes('index.html')) throw new Error('index.html is not in the bundle; cannot precache it')
      for (const fileName of bundled) {
        const item = bundle[fileName]
        hash.update(fileName)
        if (item.type === 'chunk') hash.update(item.code)
        else hash.update(typeof item.source === 'string' ? item.source : Buffer.from(item.source))
      }

      const publicDir = config.publicDir
      const publicFiles = publicDir
        ? walk(publicDir)
            .map((f) => relative(publicDir, f).split(sep).join('/'))
            .sort()
        : []
      for (const f of publicFiles) {
        hash.update(f)
        hash.update(readFileSync(join(publicDir, f)))
      }

      const precache = [...new Set(['./', 'index.html', ...bundled, ...publicFiles])].filter(
        (f) => f !== 'sw.js' && !f.endsWith('.map'),
      )
      const source = fillTemplate(template, {
        VERSION: JSON.stringify(hash.digest('hex').slice(0, 12)),
        PRECACHE: JSON.stringify(precache),
        PREFIX: JSON.stringify(PREFIX),
        CACHE_PREFIX: JSON.stringify(CACHE_PREFIX),
        SKIP_WAITING: JSON.stringify(SW_SKIP_WAITING),
      })
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  base: base(),
  plugins: [serviceWorker()],
  build: {
    target: 'safari15',
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
})
