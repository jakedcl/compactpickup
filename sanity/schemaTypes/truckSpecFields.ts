/**
 * Structured fields added on top of the original truck and manufacturer documents.
 * Every field is optional so documents written before these existed stay valid.
 */
import {defineArrayMember, defineField} from 'sanity'

export const truckSpecGroups = [
  {name: 'identity', title: 'Identity & lineage'},
  {name: 'production', title: 'Production'},
  {name: 'powertrain', title: 'Powertrain'},
  {name: 'specs', title: 'Specs & capability'},
  {name: 'editorial', title: 'Editorial'},
  {name: 'provenance', title: 'Data provenance'},
]

const stringList = (name: string, title: string, group: string, description?: string) =>
  defineField({
    name,
    title,
    type: 'array',
    group,
    description,
    of: [defineArrayMember({type: 'string'})],
  })

function truckLinkFields() {
  return [
    defineField({
      name: 'truck',
      title: 'Truck (if in dataset)',
      type: 'reference',
      to: [{type: 'truckModel'}],
    }),
    defineField({
      name: 'name',
      title: 'Name (if not in dataset)',
      type: 'string',
    }),
    defineField({
      name: 'relation',
      title: 'Relation',
      type: 'string',
      description: 'e.g. "Rebadge", "Chevrolet twin"',
    }),
  ]
}

const truckLinkPreview = {
  select: {title: 'truck.title', subtitle: 'relation', name: 'name'},
  prepare({title, subtitle, name}: {title?: string; subtitle?: string; name?: string}) {
    return {
      title: title || name || 'Related truck',
      subtitle,
    }
  },
}

export const truckSpecFields = [
  defineField({
    name: 'generation',
    title: 'Generation',
    type: 'string',
    group: 'identity',
    description: 'Free string such as "1st Gen". Already stored on some documents.',
  }),
  defineField({
    name: 'displayTitle',
    title: 'Normalized title',
    type: 'string',
    group: 'identity',
    description: 'Proposed consistent title. The site still shows `title` until that field is changed.',
  }),
  defineField({
    name: 'originalYearRange',
    title: 'Original year range',
    type: 'string',
    group: 'identity',
    description: 'Previous yearRange text, kept when the displayed range was corrected.',
  }),
  defineField({
    name: 'nameplate',
    title: 'Nameplate(s)',
    type: 'string',
    group: 'identity',
    description: 'e.g. "Hilux / Pickup / Truck (NA)"',
  }),
  stringList('internalCodes', 'Chassis / model codes', 'identity', 'e.g. N10, RN25, D21, UF, MJ'),
  defineField({
    name: 'predecessor',
    title: 'Predecessor',
    type: 'object',
    group: 'identity',
    fields: truckLinkFields(),
    preview: truckLinkPreview,
  }),
  defineField({
    name: 'successor',
    title: 'Successor',
    type: 'object',
    group: 'identity',
    fields: truckLinkFields(),
    preview: truckLinkPreview,
  }),
  defineField({
    name: 'siblings',
    title: 'Siblings / rebadges',
    type: 'array',
    group: 'identity',
    of: [
      defineArrayMember({
        type: 'object',
        fields: truckLinkFields(),
        preview: truckLinkPreview,
      }),
    ],
  }),

  defineField({
    name: 'productionStart',
    title: 'Start year',
    type: 'number',
    group: 'production',
    validation: (Rule) => Rule.integer().min(1930).max(2100),
  }),
  defineField({
    name: 'productionEnd',
    title: 'End year',
    type: 'number',
    group: 'production',
    description: 'Leave empty for "still in production".',
    validation: (Rule) => Rule.integer().min(1930).max(2100),
  }),
  defineField({
    name: 'yearBasis',
    title: 'Year basis',
    type: 'string',
    group: 'production',
    description: 'e.g. "US model years" or "Japan production years"',
  }),
  stringList('assemblyPlants', 'Assembly plants', 'production'),
  stringList('markets', 'Markets', 'production'),
  stringList('bodyStyles', 'Body styles', 'production'),
  stringList('bedLengths', 'Bed lengths', 'production'),
  stringList('trims', 'Trims & special editions', 'production'),

  defineField({
    name: 'engines',
    title: 'Engines',
    type: 'array',
    group: 'powertrain',
    of: [
      defineArrayMember({
        type: 'object',
        fields: [
          defineField({name: 'name', title: 'Name / code', type: 'string'}),
          defineField({
            name: 'displacement',
            title: 'Displacement',
            type: 'string',
            description: 'e.g. "2.4 L (146 cu in)"',
          }),
          defineField({
            name: 'config',
            title: 'Configuration',
            type: 'string',
            description: 'I4, V6, I4 diesel...',
          }),
          defineField({name: 'hp', title: 'Horsepower', type: 'number'}),
          defineField({
            name: 'torque',
            title: 'Torque',
            type: 'string',
            description: 'e.g. "160 lb-ft"',
          }),
          defineField({name: 'years', title: 'Years', type: 'string'}),
          defineField({name: 'notes', title: 'Notes', type: 'text', rows: 2}),
        ],
        preview: {select: {title: 'name', subtitle: 'years'}},
      }),
    ],
  }),
  stringList('transmissions', 'Transmissions', 'powertrain'),
  stringList('drivetrains', 'Drivetrains', 'powertrain'),

  defineField({
    name: 'dimensions',
    title: 'Dimensions',
    type: 'object',
    group: 'specs',
    fields: [
      defineField({name: 'wheelbaseIn', title: 'Wheelbase (in)', type: 'array', of: [defineArrayMember({type: 'number'})]}),
      defineField({name: 'lengthIn', title: 'Length (in)', type: 'array', of: [defineArrayMember({type: 'number'})]}),
      defineField({name: 'widthIn', title: 'Width (in)', type: 'array', of: [defineArrayMember({type: 'number'})]}),
      defineField({name: 'heightIn', title: 'Height (in)', type: 'array', of: [defineArrayMember({type: 'number'})]}),
    ],
  }),
  defineField({name: 'curbWeight', title: 'Curb weight', type: 'string', group: 'specs'}),
  defineField({name: 'payload', title: 'Payload', type: 'string', group: 'specs'}),
  defineField({name: 'towing', title: 'Towing', type: 'string', group: 'specs'}),
  defineField({name: 'launchMSRP', title: 'Launch MSRP', type: 'string', group: 'specs'}),

  defineField({
    name: 'summary',
    title: 'Summary',
    type: 'text',
    rows: 3,
    group: 'editorial',
    description: '2-3 sentences. Shown under the title and usable as the meta description.',
    validation: (Rule) => Rule.max(400),
  }),
  defineField({
    name: 'longDescription',
    title: 'Long description',
    type: 'array',
    group: 'editorial',
    description: 'Intro essay kept separate from `content`. The site renders `content` for the narrative.',
    of: [
      defineArrayMember({
        type: 'block',
        styles: [{title: 'Normal', value: 'normal'}],
        lists: [],
      }),
    ],
  }),
  stringList('notableFeatures', 'Notable features', 'editorial'),
  stringList('history', 'History & trivia', 'editorial'),
  stringList('commonIssues', 'Common issues', 'editorial'),
  defineField({
    name: 'collectibility',
    title: 'Collectibility / ownership notes',
    type: 'text',
    rows: 3,
    group: 'editorial',
  }),

  defineField({
    name: 'sources',
    title: 'Sources',
    type: 'array',
    group: 'provenance',
    of: [
      defineArrayMember({
        type: 'url',
        validation: (Rule) => Rule.uri({scheme: ['http', 'https']}),
      }),
    ],
  }),
  defineField({
    name: 'dataConfidence',
    title: 'Data confidence',
    type: 'string',
    group: 'provenance',
    options: {list: ['high', 'medium', 'low'], layout: 'radio'},
  }),
  defineField({
    name: 'dataReviewedAt',
    title: 'Last human review',
    type: 'date',
    group: 'provenance',
  }),
]

export const manufacturerProfileFields = [
  defineField({name: 'founded', title: 'Founded', type: 'string', group: 'profile'}),
  defineField({name: 'hq', title: 'Headquarters', type: 'string', group: 'profile'}),
  defineField({name: 'country', title: 'Country', type: 'string', group: 'profile'}),
  defineField({name: 'website', title: 'Website', type: 'url', group: 'profile'}),
  defineField({name: 'description', title: 'Description', type: 'text', rows: 3, group: 'profile'}),
  defineField({
    name: 'compactPickupHistory',
    title: 'Compact pickup history',
    type: 'text',
    rows: 4,
    group: 'profile',
  }),
  defineField({
    name: 'isCatchAll',
    title: 'Catch-all group',
    type: 'boolean',
    group: 'profile',
    description: 'True for the "More..." entry that groups several small brands.',
    initialValue: false,
  }),
]
