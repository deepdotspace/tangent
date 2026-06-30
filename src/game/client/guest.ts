/**
 * Guest identity — device-local guestId so an anonymous user can play with no
 * signup (FINAL-SPEC section 8). The same id keys runs server-side and is
 * handed to claimGuestData on sign-up. Persisted in localStorage AND mirrored
 * to a cookie the worker reads (`tg_guest`) so server actions can resolve
 * `anon:<guestId>`.
 */

import { useEffect, useState } from 'react'

const KEY = 'tg_guest'
const ANIMALS = [
  'Otter', 'Magpie', 'Heron', 'Lynx', 'Fennec', 'Marten', 'Plover', 'Vireo',
  'Sable', 'Quokka', 'Caracal', 'Ibis', 'Tanager', 'Pika', 'Civet', 'Saola',
]

function randomId(): string {
  const a = new Uint8Array(12)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(a)
  } else {
    for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

function ensureGuestId(): string {
  if (typeof window === 'undefined') return 'ssr'
  let id = ''
  try {
    id = window.localStorage.getItem(KEY) ?? ''
  } catch {
    id = ''
  }
  if (!id) {
    id = randomId()
    try {
      window.localStorage.setItem(KEY, id)
    } catch {
      /* storage blocked — fall back to in-memory for the session */
    }
  }
  // Mirror to a cookie the worker can read to resolve anon:<guestId>.
  try {
    document.cookie = `${KEY}=${id};path=/;max-age=${60 * 60 * 24 * 400};samesite=lax`
  } catch {
    /* ignore */
  }
  return id
}

/** Stable guestId for the session. */
export function useGuestId(): string {
  const [id] = useState(ensureGuestId)
  useEffect(() => {
    // Re-assert the cookie on mount (covers a cleared cookie / new tab).
    ensureGuestId()
  }, [])
  return id
}

/** A friendly, stable display name derived from the guestId. */
export function guestDisplayName(guestId: string): string {
  let h = 0
  for (let i = 0; i < guestId.length; i++) h = (h * 31 + guestId.charCodeAt(i)) >>> 0
  return `Anonymous ${ANIMALS[h % ANIMALS.length]}`
}
