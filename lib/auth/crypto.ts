import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { env } from '@/lib/env'

function key() {
  return createHash('sha256').update(`guestsweep:tokens:${env.sessionSecret}`).digest()
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`
}

export function decryptSecret(payload: string) {
  const [iv, tag, data] = payload.split('.')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

export function sha256Base64Url(input: string) {
  return createHash('sha256').update(input).digest('base64url')
}
