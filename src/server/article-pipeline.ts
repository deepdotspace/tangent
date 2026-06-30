/**
 * Article-serving pipeline + server-side anti-cheat (wave-0 contract).
 *
 * The single seam between the article domain and everything downstream (the
 * AppGameRoom DO, the async move-validation server actions, the renderer).
 * Everyone consumes a source-agnostic `getArticle(env, title)` and the shared
 * `extractClickableLinks` / `validateMove`; nobody touches KV or the
 * integration directly.
 *
 * KEY DECISIONS (see docs/founder/spec/2-article-pipeline.md + RESOLUTIONS B1):
 *  - SOURCE: the DeepSpace `wikipedia` integration is primary. We call it
 *    server-side through `apiWorkerFetch` with the app-owner JWT (developer
 *    billed, owner pays), endpoint `wikipedia/get-page-content`, body
 *    `{ title }`, response envelope `{ success, data: { htmlContent }, error }`.
 *  - PARSING: a dependency-free streaming tokenizer, NOT a DOM parser and NOT
 *    HTMLRewriter. Workers have no DOMParser, and HTMLRewriter is Workers-only,
 *    which would break the spec's hard requirement that `extractClickableLinks`
 *    be byte-identical offline (the Node curation graph build) and at runtime.
 *    A pure-string tokenizer runs identically in both and needs zero deps.
 *  - TITLE-keyed nav (RESOLUTIONS B1): Parsoid links carry TITLES, so the
 *    allowed-move set is a Set of normalized canonical titles. pageId is parsed
 *    from `<meta property="mw:pageId">` and used ONLY for reach equality.
 *  - ONE DOM pass yields BOTH the served HTML and the allowed-title set from
 *    the SAME final token stream, so what is clickable == what is legal.
 */

import { apiWorkerFetch } from 'deepspace/worker'
import type { ApiWorkerEnv } from 'deepspace/worker'
import { ART_CACHE_TTL_SEC, articleCacheKey } from '../game/constants'

// ── Env ──────────────────────────────────────────────────────────────────

/** The minimal env the pipeline needs. Worker `Env` satisfies this. */
export interface ArticlePipelineEnv extends ApiWorkerEnv {
  /** Global/shared article render cache (KV, `art:v1:<canonicalTitle>`). */
  ARTICLE_CACHE: KVNamespace
  /** Long-lived owner JWT; billed for developer-billed integration calls. */
  APP_OWNER_JWT: string
}

// ── Public types ─────────────────────────────────────────────────────────

export interface ProcessedArticle {
  /** Sanitized, link-rewritten body HTML (no head, no base, no scripts). */
  servedHtml: string
  /** Normalized canonical titles of exactly the clickable (legal) links. */
  allowedTitles: Set<string>
  /** Canonical integer pageId (for reach equality), or null if unknown. */
  pageId: number | null
  /** Canonical underscored title of this article (post-redirect). */
  canonicalTitle: string
}

/** Machine reasons a move can be rejected. Shared with the move-gate. */
export type MoveRejectReason = 'ILLEGAL_MOVE' | 'STALE_MOVE' | 'ARTICLE_LOAD_FAILED'

/** Thrown when the upstream article fetch fails; carries the gate reason. */
export class ArticleLoadError extends Error {
  readonly code: MoveRejectReason = 'ARTICLE_LOAD_FAILED'
  constructor(message: string) {
    super(message)
    this.name = 'ArticleLoadError'
  }
}

// ── Cached shape (what lives in KV) ──────────────────────────────────────

interface CachedArticle {
  pageId: number | null
  canonicalTitle: string
  servedHtml: string
  allowedTitles: string[]
}

// ── Link-classification rules (verified against Parsoid HTML) ────────────

/**
 * Namespace prefixes that are NOT real article titles (case-insensitive,
 * spaces normalized to underscores). The colon gotcha is load-bearing:
 * "X-Men:" and "Tremors_5:" are real titles, NOT namespaces, so we match the
 * prefix-before-the-first-colon against this denylist instead of dropping any
 * link that merely contains a colon.
 */
const NAMESPACE_DENYLIST = new Set<string>([
  'file', 'image', 'media', 'category', 'help', 'portal', 'template',
  'template_talk', 'wikipedia', 'wp', 'project', 'special', 'talk', 'user',
  'user_talk', 'mediawiki', 'module', 'draft', 'book', 'timedtext', 'gadget',
  'gadget_definition',
  // _talk variants
  'category_talk', 'help_talk', 'portal_talk', 'file_talk', 'image_talk',
  'media_talk', 'project_talk', 'wikipedia_talk', 'mediawiki_talk',
  'module_talk', 'draft_talk', 'book_talk', 'timedtext_talk', 'gadget_talk',
  'gadget_definition_talk', 'special_talk',
])

/**
 * Container classes whose entire subtree is dropped (links inside are NOT
 * legal moves) per the race-rules default (stripNavboxes=true). `.infobox`
 * and body prose are deliberately NOT here — their links stay clickable.
 */
const DROP_ZONE_CLASSES = new Set<string>([
  'navbox', 'vertical-navbox', 'sidebar', 'metadata', 'hatnote', 'reflist',
  'mw-references', 'mw-editsection',
])

/** Void elements (no closing tag, never pushed onto the open-element stack). */
const VOID_TAGS = new Set<string>([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
])

/** Tags whose start/content we never emit (sanitization). */
const SUPPRESSED_TAGS = new Set<string>(['base', 'link', 'meta', 'object', 'embed', 'iframe', 'form', 'input'])

/** Parsoid round-trip noise + dangerous attributes, always stripped. */
const DROP_ATTRS = new Set<string>(['data-mw', 'about', 'typeof', 'data-parsoid', 'data-ve-no-generated-contents'])

// ── Title normalization ──────────────────────────────────────────────────

/** Case-preserving canonical title: strip `./`, drop `#frag`, decode, `_`. */
export function toCanonicalTitle(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('./')) s = s.slice(2)
  const hash = s.indexOf('#')
  if (hash >= 0) s = s.slice(0, hash)
  try {
    s = decodeURIComponent(s)
  } catch {
    // leave as-is on malformed escapes
  }
  return s.replace(/ /g, '_')
}

/** Membership key for the allowed-set: canonical, then case-folded. */
export function normalizeTitleKey(raw: string): string {
  return toCanonicalTitle(raw).toLowerCase()
}

/** A move's `to` is legal iff it is in the frozen allowed-set. */
export function validateMove(allowedTitles: Set<string>, toTitle: string): boolean {
  return allowedTitles.has(normalizeTitleKey(toTitle))
}

// ── The single DOM pass ──────────────────────────────────────────────────

interface ParsedTag {
  name: string
  attrs: Record<string, string>
  isClose: boolean
  isSelfClose: boolean
}

interface Frame {
  name: string
  /** Close-tag string to emit on pop, or null if nothing should be emitted. */
  closeAs: string | null
  /** This frame opens a dropped subtree (decrement dropDepth on pop). */
  dropZone: boolean
  /** This frame suppresses emission (e.g. <head>; decrement on pop). */
  suppress: boolean
  /** This frame is <title> (capture text, stop on pop). */
  title: boolean
}

/**
 * `extractClickableLinks(parsoidHtml)` — ONE pass that yields the sanitized
 * served HTML AND the allowed-title set from the SAME final token stream, plus
 * the canonical pageId/title parsed from the head before it is stripped.
 *
 * Synchronous and dependency-free so it is byte-identical offline (the Node
 * curation graph build) and at runtime in the Worker (CI contract test).
 */
export function extractClickableLinks(parsoidHtml: string): ProcessedArticle {
  const allowedTitles = new Set<string>()
  const stack: Frame[] = []
  let out = ''
  let pageId: number | null = null
  let canonicalTitle = ''
  let titleText = ''

  let suppressDepth = 0 // inside <head> etc. -> capture metadata but emit nothing
  let dropDepth = 0 // inside a drop-zone subtree -> emit nothing, skip links
  let titleCapture = false

  const visible = () => suppressDepth === 0 && dropDepth === 0
  const emit = (s: string) => {
    if (visible()) out += s
  }
  const emitText = (t: string) => {
    if (titleCapture) {
      titleText += t
      return
    }
    if (visible()) out += t
  }

  const html = parsoidHtml
  const n = html.length
  let i = 0

  while (i < n) {
    const lt = html.indexOf('<', i)
    if (lt === -1) {
      emitText(html.slice(i))
      break
    }
    if (lt > i) emitText(html.slice(i, lt))

    // comments / declarations
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4)
      i = end === -1 ? n : end + 3
      continue
    }
    if (html.startsWith('<!', lt)) {
      const end = html.indexOf('>', lt)
      i = end === -1 ? n : end + 1
      continue
    }

    const gt = findTagEnd(html, lt)
    if (gt === -1) {
      emitText(html.slice(lt))
      break
    }
    const rawTag = html.slice(lt, gt + 1)
    i = gt + 1
    const tag = parseTag(rawTag)
    if (!tag.name) continue

    // <script>/<style>/<noscript>: skip raw content entirely (never tokenize).
    if (!tag.isClose && !tag.isSelfClose && (tag.name === 'script' || tag.name === 'style' || tag.name === 'noscript')) {
      const after = indexAfterCloseTag(html, tag.name, i)
      i = after === -1 ? n : after
      continue
    }

    if (tag.isClose) {
      handleClose(tag.name)
      continue
    }

    // metadata is read from the head BEFORE it is stripped
    captureMeta(tag)

    // structural wrappers: process children but never emit the wrapper itself
    if (tag.name === 'html' || tag.name === 'body') continue
    if (tag.name === 'head') {
      suppressDepth++
      stack.push({ name: 'head', closeAs: null, dropZone: false, suppress: true, title: false })
      continue
    }

    if (VOID_TAGS.has(tag.name) || tag.isSelfClose) {
      if (visible() && !SUPPRESSED_TAGS.has(tag.name)) {
        if (tag.name === 'img') emit(serializeImg(tag.attrs))
        else emit(`<${tag.name}${serializeAttrs(tag.attrs)} />`)
      }
      continue
    }

    if (tag.name === 'title') {
      titleCapture = true
      stack.push({ name: 'title', closeAs: null, dropZone: false, suppress: false, title: true })
      continue
    }

    handleStart(tag)
  }

  if (!canonicalTitle && titleText) canonicalTitle = toCanonicalTitle(titleText)

  return { servedHtml: out, allowedTitles, pageId, canonicalTitle }

  // ── inner handlers (close over the accumulators) ───────────────────────

  function handleStart(tag: ParsedTag): void {
    const isDrop = isDropZone(tag)
    const suppressedNow = !visible()
    const frame: Frame = { name: tag.name, closeAs: null, dropZone: isDrop, suppress: false, title: false }

    if (isDrop) {
      dropDepth++ // its own open + whole subtree suppressed
    } else if (!suppressedNow) {
      if (tag.name === 'a') {
        if (keepLink(tag)) {
          const target = toCanonicalTitle(tag.attrs.href ?? '')
          allowedTitles.add(normalizeTitleKey(target))
          out += `<a class="tg-link" data-tg-to="${escAttr(target)}" href="${escAttr(moveHref(target))}">`
          frame.closeAs = '</a>'
        } else {
          // demote: keep the text, kill the link (do not delete content)
          out += '<span class="tg-dead">'
          frame.closeAs = '</span>'
        }
      } else {
        out += `<${tag.name}${serializeAttrs(tag.attrs)}>`
        frame.closeAs = `</${tag.name}>`
      }
    }
    stack.push(frame)
  }

  function handleClose(name: string): void {
    if (name === 'html' || name === 'body') return
    let idx = -1
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].name === name) {
        idx = k
        break
      }
    }
    if (idx === -1) return
    while (stack.length > idx) {
      const f = stack.pop() as Frame
      if (f.dropZone) dropDepth = Math.max(0, dropDepth - 1)
      if (f.suppress) suppressDepth = Math.max(0, suppressDepth - 1)
      if (f.title) titleCapture = false
      // only the matched frame (now at the bottom of what we popped) emits
      if (stack.length === idx && f.closeAs) emit(f.closeAs)
    }
  }

  function captureMeta(tag: ParsedTag): void {
    if (tag.name === 'meta') {
      if (tag.attrs.property === 'mw:pageId' && tag.attrs.content) {
        const v = parseInt(tag.attrs.content, 10)
        if (!Number.isNaN(v)) pageId = v
      }
      return
    }
    if (tag.name === 'link') {
      const rel = tag.attrs.rel ?? ''
      if (relTokens(rel).includes('dc:isVersionOf') && tag.attrs.href) {
        canonicalTitle = lastWikiSegment(tag.attrs.href)
      }
    }
  }
}

// ── Redirect detection (used by getArticle, not part of the served pass) ──

/**
 * A redirect title served as a stub carries
 * `<link rel="mw:PageProp/redirect" href="./Canonical"/>`. Returns the
 * canonical target, or null if this is not a redirect stub.
 */
export function detectRedirectTarget(parsoidHtml: string): string | null {
  const m =
    parsoidHtml.match(/<link[^>]*rel="[^"]*mw:PageProp\/redirect[^"]*"[^>]*href="\.\/([^"#]+)"/i) ??
    parsoidHtml.match(/<link[^>]*href="\.\/([^"#]+)"[^>]*rel="[^"]*mw:PageProp\/redirect[^"]*"/i)
  return m ? toCanonicalTitle(m[1]) : null
}

function hasPageIdMeta(parsoidHtml: string): boolean {
  return /<meta[^>]*property="mw:pageId"/i.test(parsoidHtml)
}

// ── getArticle: integration -> process -> cache ──────────────────────────

/** In-isolate single-flight so concurrent misses dedupe to one fetch. */
const inflight = new Map<string, Promise<ProcessedArticle>>()

/**
 * Fetch + process + cache an article. Returns the served HTML, allowed-title
 * set, canonical pageId, and canonical title. Reads the global KV cache first;
 * on a miss fetches via the `wikipedia` integration, follows a redirect stub
 * once, processes the HTML, and writes the artifact to KV with a 24h TTL.
 */
export async function getArticle(
  env: ArticlePipelineEnv,
  title: string,
  // Internal: the lowercase requested keys already being resolved up THIS redirect
  // chain. Threaded so a redirect cycle (A->B->A) throws instead of dead-looping on
  // the in-flight promise. Public callers pass two args.
  seen?: Set<string>,
): Promise<ProcessedArticle> {
  const requestedKey = toCanonicalTitle(title)
  const cacheKey = articleCacheKey(requestedKey)
  const rkLower = requestedKey.toLowerCase()

  const cached = (await env.ARTICLE_CACHE.get(cacheKey, 'json')) as CachedArticle | null
  if (cached) return fromCached(cached)

  // Cycle guard (checked BEFORE the in-flight short-circuit, which would otherwise
  // hand back a promise that is itself awaiting us — a deadlock that no try/catch
  // could recover). Dormant in practice (the integration follows 307s) but cheap.
  if (seen && seen.has(rkLower)) {
    throw new ArticleLoadError(`redirect cycle resolving "${title}"`)
  }

  const existing = inflight.get(cacheKey)
  if (existing) return existing

  const work = (async (): Promise<ProcessedArticle> => {
    try {
      const raw = await fetchPageContentHtml(env, title)

      // Redirect stub: extract the canonical target and re-fetch once.
      if (!hasPageIdMeta(raw)) {
        const redirect = detectRedirectTarget(raw)
        if (redirect && redirect.toLowerCase() !== rkLower) {
          const nextSeen = new Set(seen)
          nextSeen.add(rkLower)
          const resolved = await getArticle(env, redirect, nextSeen)
          // Cache the alias under its OWN key too, so a repeat click on this
          // redirect link is a cache hit instead of re-fetching the stub.
          await env.ARTICLE_CACHE.put(cacheKey, JSON.stringify(toCached(resolved)), {
            expirationTtl: ART_CACHE_TTL_SEC,
          })
          return resolved
        }
      }

      const processed = extractClickableLinks(raw)
      const canonicalTitle = processed.canonicalTitle || requestedKey
      const artifact: CachedArticle = {
        pageId: processed.pageId,
        canonicalTitle,
        servedHtml: processed.servedHtml,
        allowedTitles: [...processed.allowedTitles],
      }
      const serialized = JSON.stringify(artifact)
      // Cache under the article's OWN canonical key (post-redirect), so a later
      // request for the canonical title is a hit too.
      await env.ARTICLE_CACHE.put(articleCacheKey(canonicalTitle), serialized, {
        expirationTtl: ART_CACHE_TTL_SEC,
      })
      // Also cache under the REQUESTED key when it differs, so an alias is a hit.
      if (articleCacheKey(canonicalTitle) !== cacheKey) {
        await env.ARTICLE_CACHE.put(cacheKey, serialized, { expirationTtl: ART_CACHE_TTL_SEC })
      }
      return {
        servedHtml: artifact.servedHtml,
        allowedTitles: new Set(artifact.allowedTitles),
        pageId: artifact.pageId,
        canonicalTitle,
      }
    } finally {
      inflight.delete(cacheKey)
    }
  })()

  inflight.set(cacheKey, work)
  return work
}

/** ProcessedArticle -> the KV-cached shape. */
function toCached(p: ProcessedArticle): CachedArticle {
  return {
    pageId: p.pageId,
    canonicalTitle: p.canonicalTitle,
    servedHtml: p.servedHtml,
    allowedTitles: [...p.allowedTitles],
  }
}

/**
 * Resolve a title to its canonical pageId via `wikipedia/get-page-summary`
 * (`pageData.pageid`; follows redirects). Used only when a pageId is needed
 * WITHOUT rendering — the hot path reads `mw:pageId` from the rendered HTML.
 */
export async function resolvePageId(env: ArticlePipelineEnv, title: string): Promise<number | null> {
  const res = await apiWorkerFetch(env, '/api/integrations/wikipedia/get-page-summary', {
    method: 'POST',
    headers: ownerJsonHeaders(env),
    body: JSON.stringify({ title }),
  })
  const json = (await res.json()) as
    | { success?: boolean; data?: { pageData?: { pageid?: number } } }
    | null
  if (!json?.success) return null
  const pid = json.data?.pageData?.pageid
  return typeof pid === 'number' ? pid : null
}

// ── integration call ─────────────────────────────────────────────────────

function ownerJsonHeaders(env: ArticlePipelineEnv): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.APP_OWNER_JWT}`,
  }
}

async function fetchPageContentHtml(env: ArticlePipelineEnv, title: string): Promise<string> {
  let res: Response
  try {
    res = await apiWorkerFetch(env, '/api/integrations/wikipedia/get-page-content', {
      method: 'POST',
      headers: ownerJsonHeaders(env),
      body: JSON.stringify({ title }),
    })
  } catch (err) {
    throw new ArticleLoadError(`get-page-content transport failed for "${title}": ${String(err)}`)
  }
  const json = (await res.json()) as
    | { success?: boolean; data?: { htmlContent?: string }; error?: string }
    | null
  if (!json?.success || !json.data?.htmlContent) {
    throw new ArticleLoadError(json?.error ?? `get-page-content failed for "${title}"`)
  }
  return json.data.htmlContent
}

function fromCached(c: CachedArticle): ProcessedArticle {
  return {
    servedHtml: c.servedHtml,
    allowedTitles: new Set(c.allowedTitles),
    pageId: c.pageId,
    canonicalTitle: c.canonicalTitle,
  }
}

// ── low-level tokenizer helpers ──────────────────────────────────────────

function findTagEnd(html: string, lt: number): number {
  let quote = ''
  for (let j = lt + 1; j < html.length; j++) {
    const ch = html[j]
    if (quote) {
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '>') return j
  }
  return -1
}

function indexAfterCloseTag(html: string, name: string, from: number): number {
  const lower = html.toLowerCase()
  const k = lower.indexOf('</' + name, from)
  if (k === -1) return -1
  const gt = html.indexOf('>', k)
  return gt === -1 ? -1 : gt + 1
}

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

function parseTag(rawTag: string): ParsedTag {
  const isSelfClose = rawTag.endsWith('/>')
  let inner = rawTag.slice(1, isSelfClose ? -2 : -1).trim()
  let isClose = false
  if (inner.startsWith('/')) {
    isClose = true
    inner = inner.slice(1).trim()
  }
  const nameMatch = inner.match(/^[a-zA-Z][a-zA-Z0-9:-]*/)
  const name = nameMatch ? nameMatch[0].toLowerCase() : ''
  const attrs: Record<string, string> = {}
  if (!isClose && name) {
    const rest = inner.slice(name.length)
    ATTR_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = ATTR_RE.exec(rest)) !== null) {
      if (m.index === ATTR_RE.lastIndex) ATTR_RE.lastIndex++ // guard against zero-length
      if (!m[1]) continue
      attrs[m[1].toLowerCase()] = m[4] ?? m[5] ?? m[6] ?? ''
    }
  }
  return { name, attrs, isClose, isSelfClose }
}

function relTokens(rel: string): string[] {
  return rel.split(/\s+/).filter(Boolean)
}

function isDropZone(tag: ParsedTag): boolean {
  if (tag.attrs.role === 'navigation') return true
  const cls = (tag.attrs.class ?? '').split(/\s+/)
  for (const c of cls) if (DROP_ZONE_CLASSES.has(c)) return true
  return false
}

function keepLink(tag: ParsedTag): boolean {
  const rel = relTokens(tag.attrs.rel ?? '')
  if (!rel.includes('mw:WikiLink')) return false
  if (rel.includes('mw:ExtLink')) return false

  const cls = (tag.attrs.class ?? '').split(/\s+/)
  if (cls.includes('new') || cls.includes('mw-selflink') || cls.includes('selflink')) return false

  const href = tag.attrs.href ?? ''
  // Only main-namespace internal links (`./Title`). Anchor-only (`#...`) and
  // anything else (external, interwiki) are not in-article moves.
  if (!href.startsWith('./')) return false

  const title = toCanonicalTitle(href)
  const colon = title.indexOf(':')
  if (colon > 0) {
    const prefix = title.slice(0, colon).replace(/ /g, '_').toLowerCase()
    if (NAMESPACE_DENYLIST.has(prefix)) return false
  }
  return true
}

function moveHref(canonicalTarget: string): string {
  // Degrade-without-JS internal route; the client intercepts via data-tg-to
  // and sends the move over the room socket. Never points at wikipedia.org.
  return `/go/${encodeURIComponent(canonicalTarget)}`
}

function serializeAttrs(attrs: Record<string, string>): string {
  let s = ''
  for (const [k, v] of Object.entries(attrs)) {
    if (DROP_ATTRS.has(k)) continue
    if (k.startsWith('on')) continue // strip inline event handlers
    s += ` ${k}="${escAttr(v)}"`
  }
  return s
}

function serializeImg(attrs: Record<string, string>): string {
  const copy: Record<string, string> = {}
  for (const [k, v] of Object.entries(attrs)) {
    if (DROP_ATTRS.has(k) || k.startsWith('on')) continue
    copy[k] = v
  }
  if (copy.src) copy.src = absolutize(copy.src)
  if (copy.srcset) copy.srcset = absolutizeSrcset(copy.srcset)
  copy.loading = 'lazy'
  copy.decoding = 'async'
  return `<img${serializeAttrs(copy)} />`
}

function absolutize(url: string): string {
  if (url.startsWith('//')) return 'https:' + url
  return url
}

function absolutizeSrcset(srcset: string): string {
  return srcset
    .split(',')
    .map((part) => {
      const seg = part.trim()
      if (!seg) return ''
      const sp = seg.indexOf(' ')
      const u = sp === -1 ? seg : seg.slice(0, sp)
      const rest = sp === -1 ? '' : seg.slice(sp)
      return absolutize(u) + rest
    })
    .filter(Boolean)
    .join(', ')
}

function lastWikiSegment(href: string): string {
  let h = href.trim()
  const wiki = h.indexOf('/wiki/')
  if (wiki >= 0) h = h.slice(wiki + '/wiki/'.length)
  else {
    const slash = h.lastIndexOf('/')
    if (slash >= 0) h = h.slice(slash + 1)
  }
  return toCanonicalTitle(h)
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
