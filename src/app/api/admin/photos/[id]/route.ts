import { handlePhotoImage, handlePhotoPatch } from '@/lib/binder/admin-handlers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return context.params.then(({ id }) => handlePhotoImage(request, id))
}

export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return context.params.then(({ id }) => handlePhotoPatch(request, id))
}
