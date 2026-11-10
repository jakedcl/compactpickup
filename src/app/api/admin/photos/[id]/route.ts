import { getPhotoBytes } from '@/lib/binder/r2'
import { photoKey } from '@/lib/binder/photos'
import { getSession } from '@/lib/binder/session-cookie'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { id } = await context.params
  if (!UUID.test(id)) return new Response('Not found', { status: 404 })

  try {
    const key = await photoKey(id)
    if (!key) return new Response('Not found', { status: 404 })
    const bytes = await getPhotoBytes(key)
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-type': 'image/webp',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch {
    console.error('binder: photo read failed')
    return new Response('The photo did not load.', { status: 500 })
  }
}
