import { shrinkVisitorJpeg } from './visitor-submit'

/** How the visitor brought the photo into the scanner tab. */
export type VisitorPhotoSource = 'camera' | 'library' | 'drop' | 'paste' | 'desktop'

export function shouldOfferSavePhoto(source: VisitorPhotoSource): boolean {
  return source === 'camera'
}

export async function photoFileForSave(
  file: File,
  shrink: (blob: Blob) => Promise<File> = shrinkVisitorJpeg,
): Promise<File> {
  if (file.type === 'image/jpeg' || file.type === 'image/jpg') return file
  return shrink(file)
}

export type SaveVisitorPhotoDeps = {
  canShare: (data: ShareData) => boolean
  share: (data: ShareData) => Promise<void>
  download: (file: File) => void
  shrink: (blob: Blob) => Promise<File>
}

export type SaveVisitorPhotoResult = 'shared' | 'downloaded' | 'failed'

export async function saveVisitorPhoto(
  file: File,
  deps: SaveVisitorPhotoDeps,
): Promise<SaveVisitorPhotoResult> {
  try {
    const saveFile = await photoFileForSave(file, deps.shrink)
    const named = new File([saveFile], saveFile.name || 'truck-scan.jpg', {
      type: saveFile.type || 'image/jpeg',
    })
    const payload: ShareData = { files: [named], title: 'Truck scan' }
    if (deps.canShare(payload)) {
      await deps.share(payload)
      return 'shared'
    }
    deps.download(named)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}

export function defaultSaveVisitorPhotoDeps(): SaveVisitorPhotoDeps {
  return {
    canShare: (data) =>
      typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare(data),
    share: (data) => {
      if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
        return Promise.reject(new Error('share_unavailable'))
      }
      return navigator.share(data)
    },
    download: (file) => {
      const url = URL.createObjectURL(file)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = file.name || 'truck-scan.jpg'
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    },
    shrink: shrinkVisitorJpeg,
  }
}
