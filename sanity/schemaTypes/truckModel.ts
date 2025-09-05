import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'truckModel',
  title: 'Truck Model',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Model Title',
      type: 'string',
      description: 'e.g., "Tacoma 1995-2004 (1st Gen)"',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'manufacturer',
      title: 'Manufacturer',
      type: 'reference',
      to: [{type: 'manufacturer'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'yearRange',
      title: 'Year Range',
      type: 'string',
      description: 'e.g., "1995-2004"',
    }),
    defineField({
      name: 'model3d',
      title: '3D Model',
      type: 'file',
      options: {
        accept: '.glb',
      },
      description: 'Upload GLB 3D model file (GLB format recommended - contains all assets in one file)',
    }),
    defineField({
      name: 'model3dAttribution',
      title: '3D Model Attribution',
      type: 'object',
      fields: [
        {
          name: 'creator',
          title: 'Creator Name',
          type: 'string',
          description: 'Name of the 3D model creator',
        },
        {
          name: 'source',
          title: 'Source URL',
          type: 'url',
          description: 'Link to the original model source',
        },
        {
          name: 'license',
          title: 'License',
          type: 'string',
          description: 'License type (e.g., CC Attribution, CC0, etc.)',
        },
      ],
      description: 'Attribution information for the 3D model (required for proper crediting)',
    }),
    defineField({
      name: 'content',
      title: 'Content',
      type: 'array',
      of: [
        {
          type: 'block',
          styles: [
            {title: 'Normal', value: 'normal'},
            {title: 'H1', value: 'h1'},
            {title: 'H2', value: 'h2'},
            {title: 'H3', value: 'h3'},
            {title: 'Quote', value: 'blockquote'},
          ],
          lists: [
            {title: 'Bullet', value: 'bullet'},
            {title: 'Number', value: 'number'},
          ],
          marks: {
            decorators: [
              {title: 'Strong', value: 'strong'},
              {title: 'Emphasis', value: 'em'},
              {title: 'Code', value: 'code'},
            ],
          },
        },
        {
          type: 'image',
          options: {hotspot: true},
          fields: [
            {
              name: 'alt',
              type: 'string',
              title: 'Alternative text',
            },
            {
              name: 'caption',
              type: 'string',
              title: 'Caption',
            },
          ],
        },
      ],
    }),
  ],
  preview: {
    select: {
      title: 'title',
      manufacturer: 'manufacturer.name',
      yearRange: 'yearRange',
    },
    prepare(selection) {
      const {title, manufacturer, yearRange} = selection
      return {
        title: title,
        subtitle: `${manufacturer} ${yearRange ? `(${yearRange})` : ''}`,
      }
    },
  },
  orderings: [
    {
      title: 'Manufacturer, A-Z',
      name: 'manufacturerAsc',
      by: [
        {field: 'manufacturer.name', direction: 'asc'},
        {field: 'yearRange', direction: 'asc'},
      ],
    },
  ],
})
