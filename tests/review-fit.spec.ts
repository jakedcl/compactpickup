import { expect, test } from '@playwright/test'

const TRUCK = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

const trucks = [
  { id: TRUCK, slug: 'dodge-rampage', title: 'Rampage', maker: 'Dodge' },
  { id: OTHER, slug: 'ranger-1', title: 'Ranger (1st Gen)', maker: 'Ford' },
  ...Array.from({ length: 14 }, (_, index) => ({
    id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
    slug: `model-${index}`,
    title: `Model ${index}`,
    maker: 'Chevy',
  })),
]

const faces = [
  { id: 'face-a', truckId: TRUCK, label: '1982-83' },
  { id: 'face-b', truckId: TRUCK, label: '1984' },
  { id: 'face-c', truckId: TRUCK, label: '1982-84 special' },
]

const photos = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    truckId: TRUCK,
    truckSlug: 'dodge-rampage',
    status: 'pending',
    angle: 'front',
    faceTagId: null,
    source: 'commons',
    sourceUrl: null,
    author: 'A long credit that should stay on one line',
    license: 'CC BY',
    width: 1600,
    height: 900,
    createdAt: '2026-01-01T00:00:00.000Z',
    notes: null,
    sha256: 'abc',
    hasEmbedding: false,
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    truckId: null,
    truckSlug: null,
    status: 'pending',
    angle: null,
    faceTagId: null,
    source: 'jake-upload',
    sourceUrl: null,
    author: null,
    license: null,
    width: null,
    height: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    notes: null,
    sha256: 'def',
    hasEmbedding: false,
  },
]

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function fits(page: import('@playwright/test').Page) {
  const box = await page.locator('.review-screen').evaluate((node) => ({
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
    mainScroll: (node.querySelector('.review-main') as HTMLElement).scrollHeight,
    mainClient: (node.querySelector('.review-main') as HTMLElement).clientHeight,
  }))
  expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight)
  expect(box.mainScroll).toBeLessThanOrEqual(box.mainClient)
  await page.evaluate(() => window.scrollTo(0, 800))
  await page.mouse.wheel(0, 800)
  const scrolled = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement
    return {
      y: window.scrollY,
      html: getComputedStyle(document.documentElement).overflowY,
      body: getComputedStyle(document.body).overflowY,
      canScroll: root.scrollHeight > root.clientHeight && getComputedStyle(document.documentElement).overflowY !== 'hidden' && getComputedStyle(document.body).overflowY !== 'hidden',
    }
  })
  expect(scrolled.y).toBe(0)
  expect(scrolled.html).toBe('hidden')
  expect(scrolled.body).toBe('hidden')
  expect(scrolled.canScroll).toBe(false)
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const) {
  test(`review fits ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.route('**/api/admin/**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === '/api/admin/trucks') {
        await route.fulfill({ json: { trucks, faces } })
        return
      }
      if (url.pathname === '/api/admin/photos') {
        await route.fulfill({
          json: {
            photos,
            nextCursor: null,
            counts: { pending: 2, approved: 0, rejected: 0 },
            matched: 2,
            missingEmbeddings: 0,
          },
        })
        return
      }
      if (url.pathname.startsWith('/api/admin/photos/')) {
        await route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
        return
      }
      await route.fulfill({ status: 404, json: { error: 'not mocked' } })
    })
    await page.goto('/binder/review-fit')
    const start = page.getByRole('region', { name: 'Tools' }).getByRole('button', { name: 'Start review' })
    await expect(start).toBeEnabled()
    await start.click()
    await expect(page.getByRole('dialog', { name: 'Review' })).toBeVisible()
    await fits(page)
    await page.locator('#review-model').focus()
    await expect(page.getByRole('listbox')).toBeVisible()
    await fits(page)
    await page.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: /No model/ }).click()
    await expect(page.getByRole('dialog', { name: 'Review' })).toBeVisible()
    await expect(page.getByText('No facelift tags for this truck.')).toBeVisible()
    await fits(page)
  })
}
