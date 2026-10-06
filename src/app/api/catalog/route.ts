import { getCatalog } from '@/lib/getCatalog'

export const revalidate = 3600

export async function GET() {
  try {
    const trucks = await getCatalog()
    return Response.json(trucks)
  } catch {
    return Response.json({ error: 'Could not load trucks.' }, { status: 500 })
  }
}
