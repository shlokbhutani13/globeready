import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Browser OCR runs from GlobeReady's own origin. Tesseract.js would otherwise download its worker, WebAssembly core,
// and English model from a public CDN, and that third-party code would receive the student's private image.
// The files are copied from pinned npm packages into a content-addressed folder, so they can be cached forever.
export const ocrAssetFiles = [
  ['worker.min.js', 'tesseract.js/dist/worker.min.js'],
  ['tesseract-core-lstm.wasm.js', 'tesseract.js-core/tesseract-core-lstm.wasm.js'],
  ['tesseract-core-simd-lstm.wasm.js', 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['eng.traineddata.gz', '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'],
]

export function ocrAssets({ root = process.cwd(), emit = true } = {}) {
  const sources = ocrAssetFiles.map(([name, spec]) => [name, join(root, 'node_modules', spec)])
  const hash = createHash('sha256')
  for (const [name, path] of sources) hash.update(name).update(readFileSync(path))
  const base = `/ocr/${hash.digest('hex').slice(0, 16)}`
  const byName = new Map(sources)
  const contentTypes = { '.js': 'text/javascript', '.gz': 'application/octet-stream' }

  return {
    name: 'globeready-ocr-assets',
    config() {
      return { define: { __GLOBEREADY_OCR_BASE__: JSON.stringify(base) } }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url || '').split('?')[0]
        if (!path.startsWith(`${base}/`)) return next()
        const file = byName.get(path.slice(base.length + 1))
        if (!file) return next()
        response.setHeader('Content-Type', contentTypes[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream')
        response.end(readFileSync(file))
      })
    },
    generateBundle() {
      if (!emit) return
      for (const [name, path] of sources) {
        this.emitFile({ type: 'asset', fileName: `${base.slice(1)}/${name}`, source: readFileSync(path) })
      }
    },
  }
}
