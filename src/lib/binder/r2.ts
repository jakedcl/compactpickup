import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { requireEnv } from '@/lib/binder/env'

let client: S3Client | undefined

function getClient(): S3Client {
  if (!client) {
    const accountId = requireEnv('R2_ACCOUNT_ID')
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      },
    })
  }
  return client
}

function bucket(): string {
  return requireEnv('R2_BUCKET')
}

function assertSha256(sha256: string) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('sha256 is not 64 hex characters')
}

export function photoObjectKey(sha256: string): string {
  assertSha256(sha256)
  return `photos/${sha256}.webp`
}

export function thumbObjectKey(sha256: string): string {
  assertSha256(sha256)
  return `thumbs/${sha256}.webp`
}

export function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error ? String((error as { name: unknown }).name) : ''
  if (name === 'NoSuchKey' || name === 'NotFound') return true
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
  return status === 404
}

export async function putPhoto(key: string, body: Buffer): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: 'image/webp',
      CacheControl: 'private, max-age=31536000',
    }),
  )
}

export async function readPhotoIfExists(key: string): Promise<Uint8Array | null> {
  try {
    return await getPhotoBytes(key)
  } catch (error) {
    if (isMissingObject(error)) return null
    throw error
  }
}

export async function getPhotoBytes(key: string): Promise<Uint8Array> {
  const output = await getClient().send(
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
    }),
  )
  if (!output.Body) throw new Error('R2 object was empty')
  return output.Body.transformToByteArray()
}

/** Short-lived URL for a later admin tool. The public scanner does not use this. */
export async function signedPhotoUrl(key: string, expiresIn = 300): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn },
  )
}
