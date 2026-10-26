import 'server-only'
import { generateObject } from 'ai'
import { createGateway, gateway } from '@ai-sdk/gateway'
import { z } from 'zod'
import type { ScanCatalogEntry, ScanMatch } from '@/lib/scan/types'

const visionSchema = z.object({
  scene: z.enum(['compact_pickup', 'other_vehicle', 'not_a_vehicle', 'unclear']),
  matches: z.array(
    z.object({
      makerSlug: z.string(),
      modelSlug: z.string(),
      confidence: z.number().min(0).max(1),
      reason: z.string().max(240),
    }),
  ).max(3),
})

function catalogPromptBlock(catalog: ScanCatalogEntry[]): string {
  return catalog
    .map((t) => {
      const gen = t.generation ? ` | gen: ${t.generation}` : ''
      return `- ${t.makerSlug}/${t.modelSlug} — ${t.maker} ${t.title} (${t.years})${gen}`
    })
    .join('\n')
}

function gatewayModel() {
  const modelId = process.env.SCAN_VISION_MODEL?.trim() || 'google/gemini-2.0-flash-lite'
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim()
  if (!apiKey) return null
  const gateway = createGateway({ apiKey })
  return gateway(modelId)
}

export function visionAvailable(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim())
}

export async function identifyWithVision(
  imageBytes: Uint8Array,
  mimeType: string,
  catalog: ScanCatalogEntry[],
  candidateSlugs?: Array<{ makerSlug: string; modelSlug: string }>,
): Promise<
  | { status: 'match'; matches: ScanMatch[] }
  | { status: 'not_truck'; message: string }
  | { status: 'unknown'; message: string; matches?: ScanMatch[] }
> {
  const model = gatewayModel()
  if (!model) {
    throw new Error('Vision model is not configured.')
  }

  const slugSet = new Set(catalog.map((t) => `${t.makerSlug}/${t.modelSlug}`))
  const bySlug = new Map(catalog.map((t) => [`${t.makerSlug}/${t.modelSlug}`, t]))

  const candidateNote = candidateSlugs?.length
    ? `Prefer these visually similar catalog candidates (still validate): ${candidateSlugs.map((c) => `${c.makerSlug}/${c.modelSlug}`).join(', ')}`
    : ''

  const { object } = await generateObject({
    model,
    schema: visionSchema,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You identify U.S.-market compact and mid-size pickup trucks from a fixed museum catalog.
Only return slugs that appear in this list. Rank up to 3 matches with confidence 0–1.
Use grille, headlights, badges, bed size, and era styling to separate generations and rebadges.
If the photo is not a vehicle, set scene to not_a_vehicle. If it is a vehicle but not a compact/mid pickup from the list, use other_vehicle.
${candidateNote}

Catalog:
${catalogPromptBlock(catalog)}`,
          },
          {
            type: 'image',
            image: imageBytes,
            mediaType: mimeType,
          },
        ],
      },
    ],
  })

  if (object.scene === 'not_a_vehicle') {
    return { status: 'not_truck', message: 'That does not look like a vehicle in frame.' }
  }

  const validMatches: ScanMatch[] = []
  for (const row of object.matches) {
    const key = `${row.makerSlug}/${row.modelSlug}`
    if (!slugSet.has(key)) continue
    const truck = bySlug.get(key)!
    validMatches.push({
      truckId: truck.id,
      maker: truck.maker,
      model: truck.title,
      generation: truck.generation,
      years: truck.years,
      href: truck.href,
      confidence: Math.round(row.confidence * 100) / 100,
      reason: row.reason,
    })
  }

  if (object.scene === 'other_vehicle' || validMatches.length === 0) {
    return {
      status: 'unknown',
      message: 'We see a vehicle, but it is not in the Compact Pickup catalog.',
      matches: validMatches.length ? validMatches : undefined,
    }
  }

  if (validMatches[0].confidence < 0.35) {
    return {
      status: 'unknown',
      message: 'Not confident enough to call a match. Try a clearer side or front three-quarter shot.',
      matches: validMatches,
    }
  }

  return { status: 'match', matches: validMatches }
}
