export const PHOTO_STATUSES = ['pending', 'approved', 'rejected'] as const
export type PhotoStatus = (typeof PHOTO_STATUSES)[number]

export const PHOTO_ANGLES = ['front', 'front-3q', 'side', 'rear-3q', 'rear', 'other'] as const
export type PhotoAngle = (typeof PHOTO_ANGLES)[number]

export const PHOTO_SOURCES = [
  'sanity',
  'commons',
  'flickr',
  'search',
  'jake-upload',
  'visitor',
] as const
export type PhotoSource = (typeof PHOTO_SOURCES)[number]

export function isPhotoSource(value: string): value is PhotoSource {
  return (PHOTO_SOURCES as readonly string[]).includes(value)
}
