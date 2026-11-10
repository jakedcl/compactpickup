import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildMakeMutations,
  displayModelTitle,
  isFeaturedMake,
  makeDocumentId,
  modelTitle,
  planTruckMake,
  showsOnShelf,
} from '@/lib/makes'
import { TRUCK_OVERRIDES } from '../../../scripts/fix-makes'

test('the shelf stays the seven makes plus More until featured is written', () => {
  assert.equal(showsOnShelf({ name: 'Ford', slug: 'ford' }), true)
  assert.equal(showsOnShelf({ name: 'More...', slug: 'other', isCatchAll: true }), true)
  assert.equal(showsOnShelf({ name: 'Honda', slug: 'honda' }), false)
  assert.equal(isFeaturedMake({ name: 'Ford', slug: 'ford', featured: true }), true)
  assert.equal(showsOnShelf({ name: 'Honda', slug: 'honda', featured: false }), false)
  assert.equal(showsOnShelf({ name: 'Honda', slug: 'honda', featured: true }), true)
  assert.equal(showsOnShelf({ name: 'More...', slug: 'other', featured: false, isCatchAll: true }), true)
})

test('titles do not repeat the make, and More... is not prefixed', () => {
  assert.equal(modelTitle('Honda', 'Honda Ridgeline (1st Gen)'), 'Ridgeline (1st Gen)')
  assert.equal(modelTitle('Honda', 'Ridgeline (1st Gen)'), 'Ridgeline (1st Gen)')
  assert.equal(modelTitle('More...', 'Honda Ridgeline (1st Gen)'), 'Honda Ridgeline (1st Gen)')
  assert.equal(displayModelTitle('Honda', 'Ridgeline (1st Gen)'), 'Honda Ridgeline (1st Gen)')
  assert.equal(displayModelTitle('Honda', 'Honda Ridgeline (1st Gen)'), 'Honda Ridgeline (1st Gen)')
  assert.equal(displayModelTitle('More...', 'Honda Ridgeline (1st Gen)'), 'Honda Ridgeline (1st Gen)')
  assert.equal(displayModelTitle('Ford', 'Ranger (1st Gen)'), 'Ford Ranger (1st Gen)')
})

test('title prefix assigns the make, overrides win, and a catalog make is kept', () => {
  const honda = planTruckMake({
    id: '1',
    slug: 'honda-ridgeline',
    title: 'Honda Ridgeline (1st Gen)',
    makeName: 'More...',
    makeSlug: 'other',
    summary: 'The first-generation Honda Ridgeline.',
  })
  assert.equal(honda.newMake, 'Honda')
  assert.equal(honda.newMakeSlug, 'honda')
  assert.equal(honda.newTitle, 'Ridgeline (1st Gen)')
  assert.equal(honda.source, 'title prefix')
  assert.equal(honda.flagged, false)

  const mit = planTruckMake(
    {
      id: '2',
      slug: 'mit',
      title: 'Mitsubishi Compact Rebadge',
      makeName: 'More...',
      makeSlug: 'other',
      summary: 'Reached the US under three badges.',
    },
    TRUCK_OVERRIDES,
  )
  assert.equal(mit.newMake, 'Mitsubishi')
  assert.equal(mit.newMakeSlug, 'mitsubishi')
  assert.equal(mit.newTitle, 'Mighty Max / Ram 50')
  assert.equal(mit.flagged, false)
  assert.equal(mit.changed, true)

  const ranger = planTruckMake({
    id: '3',
    slug: 'ranger-1',
    title: 'Ranger (1st Gen)',
    makeName: 'Ford',
    makeSlug: 'ford',
    summary: 'The Ford Ranger.',
  })
  assert.equal(ranger.newMake, 'Ford')
  assert.equal(ranger.newTitle, 'Ranger (1st Gen)')
  assert.equal(ranger.source, 'catalog make')
  assert.equal(ranger.changed, false)

  const datsun = planTruckMake(
    {
      id: '4',
      slug: 'datsun-3',
      title: 'Datsun 620',
      makeName: 'Nissan',
      makeSlug: 'nissan',
      summary: 'The Datsun 620.',
    },
    TRUCK_OVERRIDES,
  )
  assert.equal(datsun.newMake, 'Nissan')
  assert.equal(datsun.newTitle, 'Datsun 620')
  assert.equal(datsun.changed, false)
  for (const slug of ['datsun-1', 'datsun-2', 'datsun-3', 'datsun-4']) {
    assert.equal(TRUCK_OVERRIDES[slug]?.makeSlug, 'nissan')
    assert.equal(TRUCK_OVERRIDES[slug]?.title, undefined)
  }

  const chevy = planTruckMake({
    id: '5',
    slug: 'luv-chevy',
    title: 'LUV (Light Utility Vehicle)',
    makeName: 'Chevy',
    makeSlug: 'chevy',
    summary: 'The Chevrolet LUV was a rebadged Isuzu.',
  })
  assert.equal(chevy.newMake, 'Chevy')
  assert.equal(chevy.flagged, false)
  assert.equal(chevy.changed, false)

  const raider = planTruckMake({
    id: '6',
    slug: 'mitsubishi-raider',
    title: 'Mitsubishi Raider',
    makeName: 'More...',
    makeSlug: 'other',
    summary: 'The Raider was a rebadged Dodge Dakota.',
  })
  assert.equal(raider.newMake, 'Mitsubishi')
  assert.equal(raider.newTitle, 'Raider')
  assert.equal(raider.flagged, false)
})

test('new make ids have no dot, and a draft patch sets only the truck fields that change', () => {
  assert.equal(makeDocumentId('dodge').includes('.'), false)
  assert.equal(makeDocumentId('dodge'), 'make-dodge')
  const plans = ['dodge', 'jeep', 'honda', 'hummer', 'mitsubishi', 'subaru', 'suzuki', 'volkswagen'].map((slug) =>
    planTruckMake({
      id: `truck-${slug}`,
      slug: `${slug}-truck`,
      title: `${slug} Truck`,
      makeName: 'More...',
      makeSlug: 'other',
    }),
  )
  const { mutations, draftPatches } = buildMakeMutations(plans, [])
  const creates = mutations.flatMap((mutation) => ('createIfNotExists' in mutation ? [mutation.createIfNotExists] : []))
  assert.equal(creates.length, 8)
  for (const doc of creates) {
    assert.equal(doc._id.includes('.'), false)
    assert.equal(doc.featured, false)
  }
  assert.equal(draftPatches.length, plans.length)
  for (const patch of draftPatches) {
    assert.equal('patch' in patch, true)
    if (!('patch' in patch)) continue
    assert.deepEqual(Object.keys(patch.patch.set).sort(), ['manufacturer', 'title'])
    assert.equal(patch.patch.id.startsWith('drafts.'), true)
    const ref = patch.patch.set.manufacturer as { _ref: string }
    assert.equal(ref._ref.includes('.'), false)
  }
})
