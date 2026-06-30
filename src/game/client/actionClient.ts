/**
 * Action client — invoke a DeepSpace server action at /api/actions/:name.
 *
 * The action route requires a signed-in caller today; guest-first async play
 * is part of the server agent's in-flight work (it resolves anon:<guestId>
 * from the tg_guest cookie). This client always sends the Bearer token when
 * present AND the guestId in the body, and returns a typed envelope so callers
 * can fall back to the demo engine gracefully when the action is not callable.
 */

import { getAuthToken } from 'deepspace'

export type ActionEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number }

export async function invokeAction<T>(
  name: string,
  params: Record<string, unknown>,
  guestId?: string,
): Promise<ActionEnvelope<T>> {
  let token: string | null = null
  try {
    token = await getAuthToken()
  } catch {
    token = null
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const body = guestId ? { ...params, guestId } : params

  try {
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, status: res.status }
    }
    const json = (await res.json()) as
      | { success: true; data: T }
      | { success: false; error: string }
      | T
    // Server actions wrap in { success, data }. Tolerate a bare payload too.
    if (json && typeof json === 'object' && 'success' in json) {
      if ((json as { success: boolean }).success) {
        return { ok: true, data: (json as { data: T }).data }
      }
      return { ok: false, error: (json as { error?: string }).error ?? 'Action failed' }
    }
    return { ok: true, data: json as T }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

/** Fetch a rendered article. Returns null on any failure (caller falls back to demo). */
export async function fetchArticle(
  title: string,
  guestId?: string,
): Promise<{ servedHtml: string; pageId: number; canonicalTitle: string } | null> {
  try {
    const qs = new URLSearchParams({ title })
    if (guestId) qs.set('guestId', guestId)
    const res = await fetch(`/api/article?${qs.toString()}`, { credentials: 'include' })
    if (!res.ok) return null
    const json = (await res.json()) as {
      servedHtml?: string
      pageId?: number
      canonicalTitle?: string
    }
    if (typeof json.servedHtml !== 'string') return null
    return {
      servedHtml: json.servedHtml,
      pageId: json.pageId ?? 0,
      canonicalTitle: json.canonicalTitle ?? title,
    }
  } catch {
    return null
  }
}
