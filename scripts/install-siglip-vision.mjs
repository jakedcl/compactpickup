/**
 * Place the taught SigLIP2 vision ONNX beside the small config files under public/models/.
 * Run before `next build` on Vercel (or locally after pulling the repo without the weights).
 *
 * Supply the weights with one of:
 *   SIGLIP_VISION_ONNX_PATH — local file to copy
 *   SIGLIP_VISION_ONNX_URL   — HTTPS URL to download (Vercel build secret, optional R2 presign)
 *
 * If the destination already exists with the expected sha256, the script exits 0.
 * If no source is configured and the file is missing, the script prints a warning and exits 0
 * so CI can still typecheck/build; the scanner will fail at model load until weights are installed.
 */
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'

const EXPECTED_SHA256 =
  '220d474a3a1261059c8f66b133e04cb76666ecadd0dc6e225ca24a735366e91b'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEST = path.join(ROOT, 'public/models/siglip2-base-ft20261112/onnx/vision_model_q4.onnx')

async function sha256File(filePath) {
  const hash = createHash('sha256')
  hash.update(await readFile(filePath))
  return hash.digest('hex')
}

async function verifyDest() {
  try {
    const info = await stat(DEST)
    if (!info.isFile()) return false
    const digest = await sha256File(DEST)
    if (digest === EXPECTED_SHA256) {
      console.log('install-siglip-vision: vision_model_q4.onnx already present and verified.')
      return true
    }
    console.warn(
      `install-siglip-vision: ${DEST} exists but sha256 is ${digest}, expected ${EXPECTED_SHA256}; replacing.`,
    )
  } catch {
  /* missing */
  }
  return false
}

async function copyFrom(pathOrUrl, label) {
  await mkdir(path.dirname(DEST), { recursive: true })
  if (label === 'url') {
    const response = await fetch(pathOrUrl)
    if (!response.ok) {
      throw new Error(`GET ${pathOrUrl} → ${response.status}`)
    }
    const tmp = `${DEST}.partial`
    await pipeline(response.body, createWriteStream(tmp))
    const digest = await sha256File(tmp)
    if (digest !== EXPECTED_SHA256) {
      throw new Error(`Downloaded weights sha256 mismatch: got ${digest}`)
    }
    await copyFile(tmp, DEST)
    console.log('install-siglip-vision: downloaded and verified vision_model_q4.onnx')
    return
  }
  const digest = await sha256File(pathOrUrl)
  if (digest !== EXPECTED_SHA256) {
    throw new Error(`Source file sha256 mismatch: got ${digest}`)
  }
  await copyFile(pathOrUrl, DEST)
  console.log('install-siglip-vision: copied and verified vision_model_q4.onnx')
}

async function main() {
  if (await verifyDest()) return

  const localPath = process.env.SIGLIP_VISION_ONNX_PATH?.trim()
  const remoteUrl = process.env.SIGLIP_VISION_ONNX_URL?.trim()

  if (localPath) {
    await copyFrom(localPath, 'path')
    return
  }
  if (remoteUrl) {
    await copyFrom(remoteUrl, 'url')
    return
  }

  console.warn(
    'install-siglip-vision: taught vision_model_q4.onnx is missing. Set SIGLIP_VISION_ONNX_PATH or SIGLIP_VISION_ONNX_URL before build, or copy the file to public/models/siglip2-base-ft20261112/onnx/vision_model_q4.onnx. Scanner embed will fail until it is present.',
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
