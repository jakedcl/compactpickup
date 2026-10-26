import 'server-only'

const CLIP_MODEL = 'Xenova/clip-vit-base-patch32'

let pipelinePromise: Promise<Awaited<ReturnType<typeof loadPipeline>>> | null = null

async function loadPipeline() {
  const { pipeline, RawImage } = await import('@xenova/transformers')
  const extractor = await pipeline('image-feature-extraction', CLIP_MODEL, { quantized: true })
  return { extractor, RawImage }
}

export async function embedImageBytes(bytes: Uint8Array, mimeType = 'image/jpeg'): Promise<number[]> {
  if (!pipelinePromise) pipelinePromise = loadPipeline()
  const { extractor, RawImage } = await pipelinePromise
  const copy = new Uint8Array(bytes)
  const blob = new Blob([copy], { type: mimeType })
  const image = await RawImage.fromBlob(blob)
  const output = await extractor(image, { pooling: 'mean', normalize: true } as Record<string, unknown>)
  return Array.from(output.data as Float32Array)
}
