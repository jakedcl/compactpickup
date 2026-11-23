'use client'

import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {studioDataset, studioProjectId} from './env'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'Compact Pickup',
  basePath: '/studio',

  projectId: studioProjectId,
  dataset: studioDataset,

  releases: {enabled: false},
  scheduledDrafts: {enabled: false},
  tasks: {enabled: false},

  plugins: [structureTool(), visionTool()],

  schema: {
    types: schemaTypes,
  },
})
