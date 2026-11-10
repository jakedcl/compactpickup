'use client'

import { useState } from 'react'
import { binderApi, BinderApiError } from '@/app/binder/api'
import { fileForUpload } from '@/app/binder/shrink-photo'
import type { ReviewTruck } from '@/lib/binder/review'

type Outcome = 'inserted' | 'duplicate'

export function UploadPanel({
  trucks,
  disabled,
  onDone,
}: {
  trucks: ReviewTruck[]
  disabled: boolean
  onDone: () => void
}) {
  const [truckId, setTruckId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [batch, setBatch] = useState(0)
  const [lines, setLines] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function upload() {
    setError(null)
    setLines([])
    if (!truckId) {
      setError('Pick a truck first.')
      return
    }
    if (files.length === 0) {
      setError('Choose at least one photo.')
      return
    }
    setBusy(true)
    let added = 0
    let duplicates = 0
    let failed = 0
    const notes: string[] = []
    for (const file of files) {
      try {
        const blob = await fileForUpload(file)
        const form = new FormData()
        form.set('truckId', truckId)
        form.set('file', blob, file.name.replace(/\.[^.]+$/, '') + '.webp')
        const result = await binderApi<{ outcome: Outcome }>('/api/admin/uploads', { method: 'POST', body: form })
        if (result.outcome === 'inserted') {
          added += 1
          notes.push(`${file.name}: added to pending`)
        } else {
          duplicates += 1
          notes.push(`${file.name}: already in the library`)
        }
      } catch (caught) {
        failed += 1
        const message = caught instanceof BinderApiError || caught instanceof Error ? caught.message : 'failed'
        notes.push(`${file.name}: ${message}`)
      }
      setLines([...notes])
    }
    setBusy(false)
    setFiles([])
    setBatch((value) => value + 1)
    if (added > 0) onDone()
    setError(
      failed > 0
        ? `Added ${added}. ${duplicates} already in the library. ${failed} failed.`
        : null,
    )
    if (failed === 0) {
      notes.unshift(`Added ${added}. ${duplicates} already in the library.`)
      setLines([...notes])
    }
  }

  return (
    <form
      className="binder-upload"
      onSubmit={(event) => {
        event.preventDefault()
        void upload()
      }}
    >
      <label htmlFor="upload-truck">Truck</label>
      <select
        id="upload-truck"
        value={truckId}
        onChange={(event) => setTruckId(event.target.value)}
        disabled={busy || disabled}
        required
      >
        <option value="">Pick a truck</option>
        {trucks.map((truck) => (
          <option key={truck.id} value={truck.id}>
            {truck.maker ? `${truck.maker} ${truck.title}` : truck.title}
          </option>
        ))}
      </select>
      <label htmlFor="upload-files">Photos</label>
      <input
        id="upload-files"
        key={batch}
        type="file"
        accept="image/*"
        multiple
        disabled={busy || disabled}
        onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
      />
      <button type="submit" className="btn btn-accent" disabled={busy || disabled}>
        {busy ? 'Uploading' : 'Upload to pending'}
      </button>
      {files.length > 0 ? <p>{files.length} selected</p> : null}
      {error ? (
        <p className="binder-note is-bad" role="alert">
          {error}
        </p>
      ) : null}
      {lines.length > 0 ? (
        <ul className="binder-file-list">
          {lines.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ul>
      ) : null}
    </form>
  )
}
