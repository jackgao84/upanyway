import { defineConfig, type Plugin } from 'vite'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** GitHub Pages serves this repo at /<repo>/. Override with VITE_BASE=/other/ if the repo is renamed. */
const BASE = process.env.VITE_BASE ?? '/upanyway/'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

/**
 * Emits dist/sw.js from src/sw/sw-template.js with the full precache list and a
 * content hash. Cache names are always prefixed "upanyway:" (shared origin rule).
 */
function serviceWorker(): Plugin {
  return {
    name: 'upanyway-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const hash = createHash('sha256')
      const bundled = Object.keys(bundle).sort()
      for (const fileName of bundled) {
        const item = bundle[fileName]
        hash.update(fileName)
        if (item.type === 'chunk') hash.update(item.code)
        else hash.update(typeof item.source === 'string' ? item.source : Buffer.from(item.source))
      }
      const publicFiles = walk('public')
        .map((f) => relative('public', f).split(sep).join('/'))
        .sort()
      for (const f of publicFiles) {
        hash.update(f)
        hash.update(readFileSync(join('public', f)))
      }
      const precache = [...new Set(['./', 'index.html', ...bundled, ...publicFiles])].filter(
        (f) => f !== 'sw.js' && !f.endsWith('.map'),
      )
      const version = hash.digest('hex').slice(0, 12)
      const source = readFileSync('src/sw/sw-template.js', 'utf8')
        .replace('__PRECACHE__', JSON.stringify(precache))
        .replace('__VERSION__', JSON.stringify(version))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  base: BASE,
  plugins: [serviceWorker()],
  build: {
    target: 'safari15',
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
})
