import {defineField, defineType} from 'sanity'
import {manufacturerProfileFields} from './truckSpecFields'

export default defineType({
  name: 'manufacturer',
  title: 'Manufacturer',
  type: 'document',
  groups: [
    {name: 'content', title: 'Content', default: true},
    {name: 'profile', title: 'Profile'},
  ],
  fields: [
    defineField({
      name: 'name',
      title: 'Manufacturer Name',
      type: 'string',
      group: 'content',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'content',
      options: {
        source: 'name',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'image',
      group: 'content',
      options: {
        hotspot: true,
      },
    }),
    ...manufacturerProfileFields,
  ],
  preview: {
    select: {
      title: 'name',
      media: 'logo',
    },
  },
})
