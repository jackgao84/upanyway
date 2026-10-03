/**
 * The parent PIN: 4 digits, stored as a salted SHA-256. A deterrent for a young climber, not security
 * (the save sits in plain localStorage on the device either way).
 */
import { sha256Hex } from './hash'
import { newId } from './ids'

export interface PinRecord {
  pinHash: string
  pinSalt: string
}

export function isValidPin(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin)
}

function hashPin(pin: string, salt: string): string {
  return sha256Hex(`upanyway:pin:${salt}:${pin}`)
}

/** Throws on anything but exactly 4 digits (the PIN pad only produces those). */
export function makePinRecord(pin: string): PinRecord {
  if (!isValidPin(pin)) throw new Error('A PIN is exactly 4 digits.')
  const pinSalt = newId()
  return { pinHash: hashPin(pin, pinSalt), pinSalt }
}

export function verifyPin(pin: string, record: PinRecord): boolean {
  if (!record.pinHash || !isValidPin(pin)) return false
  return hashPin(pin, record.pinSalt) === record.pinHash
}

export function hasPin(record: PinRecord): boolean {
  return record.pinHash.length > 0
}
