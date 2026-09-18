import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const KEY_LENGTH = 64
const SALT_LENGTH = 16

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  const scheme = parts[0]
  const saltPart = parts[1]
  const hashPart = parts[2]
  if (scheme !== 'scrypt' || !saltPart || !hashPart) return false

  const salt = Buffer.from(saltPart, 'base64')
  const expected = Buffer.from(hashPart, 'base64')
  const actual = (await scrypt(password, salt, expected.length)) as Buffer
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}
