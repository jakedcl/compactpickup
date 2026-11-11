// Embed local photos with the shipped scanner pipeline (src/lib/clip/browser.ts) in headless Chromium.
// Same code as /scan and /binder, so the vectors match what is stored in photos.embedding_siglip.
//
//   node scripts/scanner-eval/embed.mjs <list.txt> <out.f32>
//
// list.txt: one image path per line (relative to the repo root or absolute).
// out.f32: float32 little-endian, 768 numbers per line of list.txt, in the same order.
// Needs network access (models from huggingface.co, onnxruntime wasm from cdn.jsdelivr.net).
// Set CHROME_PATH to use an installed Chrome instead of Playwright's Chromium.
// esbuild comes with tsx (a dev dependency); @playwright/test is a dev dependency.
import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [listFile, outFile] = process.argv.slice(2)
if (!listFile || !outFile) {
  console.error('usage: node scripts/scanner-eval/embed.mjs <list.txt> <out.f32>')
  process.exit(1)
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const paths = (await readFile(listFile, 'utf8')).split('\n').map((line) => line.trim()).filter(Boolean)
const work = await mkdtemp(path.join(tmpdir(), 'scanner-eval-'))
const entry = path.join(work, 'entry.ts')
await writeFile(
  entry,
  `import { embedImage } from '@/lib/clip/browser'
(window as unknown as { embedUrl: (u: string) => Promise<number[]> }).embedUrl = async (u: string) =>
  Array.from(await embedImage(await (await fetch(u)).blob()))
;(window as unknown as { ready: boolean }).ready = true
`,
)
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: path.join(work, 'bundle.js'),
  alias: { '@': path.join(root, 'src') },
  nodePaths: [path.join(root, 'node_modules')],
  logLevel: 'error',
})
const bundle = await readFile(path.join(work, 'bundle.js'))
const page = Buffer.from('<!doctype html><script type="module" src="/bundle.js"></script>')

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(page)
  if (url.pathname === '/bundle.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(bundle)
  const index = Number(url.searchParams.get('i'))
  if (url.pathname === '/img' && Number.isInteger(index) && paths[index]) {
    try {
      return res.writeHead(200).end(await readFile(path.resolve(root, paths[index])))
    } catch {
      return res.writeHead(404).end()
    }
  }
  res.writeHead(404).end()
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
const tab = await browser.newPage()
tab.on('pageerror', (error) => console.error('pageerror', error.message))
await tab.goto(`http://127.0.0.1:${port}/`)
await tab.waitForFunction(() => window.ready === true, null, { timeout: 120_000 })
const out = new Float32Array(paths.length * 768)
for (let i = 0; i < paths.length; i += 1) {
  const vector = await tab.evaluate((u) => window.embedUrl(u), `/img?i=${i}`)
  if (vector.length !== 768) throw new Error(`unexpected fingerprint length for ${paths[i]}`)
  out.set(vector, i * 768)
  if ((i + 1) % 50 === 0) console.error(`${i + 1}/${paths.length}`)
}
await writeFile(outFile, Buffer.from(out.buffer))
await browser.close()
server.close()
console.error(`wrote ${paths.length} fingerprints to ${outFile}`)
