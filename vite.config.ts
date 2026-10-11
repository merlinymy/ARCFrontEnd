import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// pdf.js loads a few data files at run time: character maps (CJK text), the
// 14 standard fonts (PDFs that do not embed Helvetica and friends), the wasm
// image decoders (JPEG 2000, JBIG2) and an ICC profile. They live in
// node_modules/pdfjs-dist, and the viewer asks for them under /pdfjs/<dir>/.
// Served from node_modules in dev, copied into dist/pdfjs/ by the build.
const PDFJS_DATA_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs']

function pdfjsData(): Plugin {
  const require = createRequire(import.meta.url)
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'))
  const mime: Record<string, string> = {
    '.wasm': 'application/wasm',
    '.js': 'text/javascript',
  }

  const listFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      return entry.isDirectory() ? listFiles(full) : [full]
    })

  return {
    name: 'pdfjs-data',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '')
        if (!PDFJS_DATA_DIRS.includes(rel.split('/')[0])) return next()
        const file = path.join(root, rel)
        // Never serve anything outside the pdf.js data directories.
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return next()
        }
        res.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream')
        fs.createReadStream(file).pipe(res)
      })
    },
    generateBundle() {
      for (const dir of PDFJS_DATA_DIRS) {
        const base = path.join(root, dir)
        if (!fs.existsSync(base)) continue
        for (const file of listFiles(base)) {
          this.emitFile({
            type: 'asset',
            fileName: `pdfjs/${dir}/${path.relative(base, file).split(path.sep).join('/')}`,
            source: fs.readFileSync(file),
          })
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsData()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          // Disable buffering for SSE stream endpoints
          proxy.on('proxyReq', (proxyReq, req) => {
            if (req.url && req.url.includes('/stream')) {
              proxyReq.setHeader('Cache-Control', 'no-cache');
              proxyReq.setHeader('Accept', 'text/event-stream');
            }
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            if (req.url && req.url.includes('/stream')) {
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
    },
  },
})
