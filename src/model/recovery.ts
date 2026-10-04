/**
 * The grown-ups' recovery code (Decision 87). Twelve characters from an alphabet with no look-alikes
 * (no 0/O, no 1/I/L), shown once as three groups ("K7QM-4XPA-TR9D") for a grown-up to write down.
 * Only a salted SHA-256 of it is saved, like the PIN — never the code itself. "Forgot PIN?" asks for
 * it, then sets a new PIN and shows a new code (the old one is used up). Typing it is forgiving: any
 * case, and spaces and dashes are ignored.
 */
import { sha256Hex } from './hash'
import { newId, randomBytes } from './ids'

/** 8 digits + 23 capitals: 0, 1, I, L and O are left out, so nothing can be misread. */
export const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const RECOVERY_LENGTH = 12
/** Shown in groups of this many, joined by dashes. */
export const RECOVERY_GROUP = 4
/** Codes that don't match before "Forgot PIN?" makes the grown-up wait. */
export const RECOVERY_FREE_TRIES = 5
/** The wait after each wrong code from then on. 31^12 ≈ 8 × 10^17 codes: this only slows a guesser. */
export const RECOVERY_WAIT_MS = 30_000

export interface RecoveryRecord {
  recoveryHash: string
  recoverySalt: string
}

/** 248 = 31 × 8: rejecting the top 8 byte values keeps every character equally likely. */
const ACCEPT_BELOW = 256 - (256 % RECOVERY_ALPHABET.length)

/** A new code, already grouped ("K7QM-4XPA-TR9D"). `bytes` is for tests; the app uses the default. */
export function newRecoveryCode(bytes: (n: number) => Uint8Array = randomBytes): string {
  let s = ''
  while (s.length < RECOVERY_LENGTH) {
    for (const b of bytes(32)) {
      if (b < ACCEPT_BELOW) s += RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]
      if (s.length === RECOVERY_LENGTH) break
    }
  }
  return formatRecoveryCode(s)
}

/** What a grown-up typed, the forgiving way: capitals, with spaces and dashes of any kind removed. */
export function cleanRecoveryInput(input: string): string {
  return input.toUpperCase().replace(/[\s\-‐‑‒–—―−_]+/g, '')
}

/** "K7QM4XPATR9D" (or any typed form of it) → "K7QM-4XPA-TR9D". */
export function formatRecoveryCode(code: string): string {
  const clean = cleanRecoveryInput(code)
  const groups: string[] = []
  for (let i = 0; i < clean.length; i += RECOVERY_GROUP) groups.push(clean.slice(i, i + RECOVERY_GROUP))
  return groups.join('-')
}

/** "K7QM-4XPA-TR9D" → "K 7 Q M, 4 X P A, T R 9 D" (screen readers read it one character at a time). */
export function spellRecoveryCode(code: string): string {
  return formatRecoveryCode(code)
    .split('-')
    .map((group) => group.split('').join(' '))
    .join(', ')
}

/** Characters typed that a code never has (after cleaning), each once: ["O", "1"]. */
export function strangeRecoveryChars(input: string): string[] {
  const out: string[] = []
  for (const ch of cleanRecoveryInput(input)) if (!RECOVERY_ALPHABET.includes(ch) && !out.includes(ch)) out.push(ch)
  return out
}

/** Could this be a code at all: 12 characters, all from the alphabet (after cleaning)? */
export function isRecoveryCodeShaped(input: string): boolean {
  const clean = cleanRecoveryInput(input)
  return clean.length === RECOVERY_LENGTH && strangeRecoveryChars(clean).length === 0
}

function hashCode(clean: string, salt: string): string {
  return sha256Hex(`upanyway:recovery:${salt}:${clean}`)
}

/** The salted hash to save for a code. Throws on anything that isn't a code. */
export function makeRecoveryRecord(code: string): RecoveryRecord {
  if (!isRecoveryCodeShaped(code)) throw new Error('A recovery code is 12 characters from the recovery alphabet.')
  const recoverySalt = newId()
  return { recoveryHash: hashCode(cleanRecoveryInput(code), recoverySalt), recoverySalt }
}

export function verifyRecoveryCode(input: string, record: RecoveryRecord): boolean {
  if (!hasRecoveryCode(record) || !isRecoveryCodeShaped(input)) return false
  return hashCode(cleanRecoveryInput(input), record.recoverySalt) === record.recoveryHash
}

export function hasRecoveryCode(record: RecoveryRecord): boolean {
  return record.recoveryHash.length > 0
}

/** The no-code record (a new save, a save from before recovery codes, or a code just used up). */
export function noRecoveryCode(): RecoveryRecord {
  return { recoveryHash: '', recoverySalt: '' }
}

/** A stored record worth keeping: a 64-character hex hash with its salt (anything else = no code). */
export function isRecoveryRecord(hash: unknown, salt: unknown): boolean {
  return typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash) && typeof salt === 'string' && salt !== ''
}

/** How long to wait after `wrongTries` codes in a row didn't match: none for the first few. */
export function recoveryWaitMs(wrongTries: number): number {
  return wrongTries >= RECOVERY_FREE_TRIES ? RECOVERY_WAIT_MS : 0
}
