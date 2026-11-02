import { DomUtils, parseDocument } from "htmlparser2"
import type { AnyNode, ChildNode, Element } from "domhandler"

/**
 * The allow list every generated page goes through (docs/crm-v1/AGENTS-IA.md §16), whatever the model wrote: only
 * known elements and attributes stay, so no script, event handler, frame, form or external resource can reach a page.
 * The page is then served under `Content-Security-Policy: sandbox`, a second, independent barrier.
 *
 * Images may only be the site's own, hosted with the page (`asset:<name>`); links only https:, tel:, mailto: or an
 * anchor of the page. The tree is serialised again from scratch, so what a browser parses is what was checked.
 */
export const ASSET_SCHEME = "cleads-asset:"

const HTML_TAGS = new Set([
  "header", "nav", "main", "section", "article", "aside", "footer", "div", "span", "p", "a", "ul", "ol", "li", "dl", "dt", "dd",
  "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "b", "i", "small", "br", "hr", "img", "figure", "figcaption", "blockquote",
  "q", "cite", "address", "time", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "details", "summary", "abbr",
  "mark", "sup", "sub", "s", "u",
])
const SVG_TAGS = new Set(["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs", "lineargradient", "radialgradient", "stop", "clippath"])
/** Removed with everything inside: code, frames, forms, media, raw-text and foreign-content elements. */
const DROP = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "form", "input", "select", "option", "optgroup", "textarea",
  "template", "noscript", "link", "meta", "base", "title", "head", "math", "foreignobject", "use", "image", "animate", "animatemotion",
  "animatetransform", "set", "audio", "video", "source", "track", "canvas", "portal", "slot", "dialog", "xmp", "plaintext", "noembed",
  "noframes", "param", "map", "area", "desc", "filter", "mask", "pattern", "symbol", "marker", "text", "textpath", "tspan", "switch", "view",
])

const GLOBAL_ATTRS = new Set(["class", "id", "title", "role", "aria-label", "aria-hidden", "aria-labelledby", "aria-describedby", "aria-current", "lang", "dir"])
const TAG_ATTRS: Record<string, readonly string[]> = {
  a: ["href", "target"],
  img: ["src", "alt", "width", "height"],
  time: ["datetime"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan", "scope"],
  ol: ["start"],
  details: ["open"],
  abbr: ["title"],
}
const SVG_ATTRS = new Set([
  "viewbox", "xmlns", "width", "height", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-opacity",
  "fill-opacity", "fill-rule", "clip-rule", "clip-path", "opacity", "transform", "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2",
  "points", "offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform", "fx", "fy", "preserveaspectratio", "focusable",
])

const MANAGED_IMG_ATTRS = new Set(["loading", "decoding", "fetchpriority"])
const ROLES = new Set(["img", "presentation", "none", "list", "listitem", "region", "navigation", "banner", "contentinfo", "note", "group", "separator"])
const ID = /^[A-Za-z][\w-]{0,63}$/
const NUMBER = /^-?\d+(\.\d+)?(%|px)?$/
const PAINT = /^(none|currentcolor|transparent|#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,%]+\)|url\(#[A-Za-z][\w-]{0,40}\))$/i
const SVG_VALUE: Record<string, RegExp> = {
  viewbox: /^[-\d\s.,]{1,60}$/,
  d: /^[MmLlHhVvCcSsQqTtAaZz\d\s.,eE+-]{1,12000}$/,
  points: /^[\d\s.,eE+-]{1,4000}$/,
  transform: /^(\s*(matrix|translate|scale|rotate|skewX|skewY)\([-\d\s.,eE]+\)\s*)+$/i,
  xmlns: /^http:\/\/www\.w3\.org\/2000\/svg$/,
  "stroke-linecap": /^(butt|round|square)$/,
  "stroke-linejoin": /^(miter|round|bevel)$/,
  "stroke-dasharray": /^[\d\s.,]{1,40}$/,
  "fill-rule": /^(nonzero|evenodd)$/,
  "clip-rule": /^(nonzero|evenodd)$/,
  gradientunits: /^(userSpaceOnUse|objectBoundingBox)$/i,
  gradienttransform: /^(\s*(matrix|translate|scale|rotate)\([-\d\s.,eE]+\)\s*)+$/i,
  preserveaspectratio: /^[a-zA-Z\s]{1,30}$/,
  focusable: /^(true|false)$/,
}
const PAINT_ATTRS = new Set(["fill", "stroke", "stop-color", "clip-path"])

export const LIMITS = { inputChars: 400_000, nodes: 6_000, depth: 60 } as const

export interface SanitizeReport {
  /** What was taken out, by element or attribute, with how many times. */
  removed: Record<string, number>
  /** Asset names the page shows, in order. */
  images: string[]
  links: { tel: number; mailto: number; https: number; anchors: number }
  /** Ids the page defines, for its anchors. */
  ids: string[]
}

export interface SanitizeOptions {
  /** The site's images, by name, with their size: other images are removed. */
  assets: ReadonlyMap<string, { width: number | null; height: number | null; kind: string }>
}

/** Control characters and spaces a browser ignores in a URL scheme ("java\tscript:"). */
const squeeze = (v: string) => v.replace(/[\u0000- \u007f-\u009f]/g, "")

/** The link as a browser would follow it, if it is one a page may hold; null otherwise. */
export function safeHref(raw: string): { href: string; kind: keyof SanitizeReport["links"] } | null {
  const v = squeeze(raw)
  if (/^#[A-Za-z][\w-]{0,63}$/.test(v) || v === "#") return { href: v, kind: "anchors" }
  const tel = /^tel:(\+?[\d().-]{4,30})$/i.exec(v)
  if (tel) return { href: `tel:${tel[1].replace(/[().-]/g, "")}`, kind: "tel" }
  if (/^mailto:[^\s<>"'?#@]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}(\?subject=[^\s<>"'#&]{0,200})?$/i.test(v)) return { href: v, kind: "mailto" }
  if (/^https:\/\//i.test(v)) {
    try {
      const url = new URL(v)
      if (url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".")) return { href: url.toString(), kind: "https" }
    } catch {
      return null
    }
  }
  return null
}

/** The asset an image source points to: `asset:logo` as the Designer writes it, `cleads-asset:logo` once stored. */
export function assetName(src: string): string | null {
  const m = /^(?:cleads-asset|asset):([a-z0-9][a-z0-9-]{0,39})$/.exec(squeeze(src))
  return m ? m[1] : null
}

const text = (v: string, max: number) => v.replace(/\s+/g, " ").trim().slice(0, max)

class Cleaner {
  readonly report: SanitizeReport = { removed: {}, images: [], links: { tel: 0, mailto: 0, https: 0, anchors: 0 }, ids: [] }
  private nodes = 0
  private ids = new Set<string>()

  constructor(private readonly opts: SanitizeOptions) {}

  private drop(what: string) {
    this.report.removed[what] = (this.report.removed[what] ?? 0) + 1
  }

  /** The cleaned children of a node: kept, unwrapped or dropped, recursively. */
  children(nodes: readonly ChildNode[], depth: number, svg: boolean): ChildNode[] {
    const out: ChildNode[] = []
    for (const node of nodes) {
      if (++this.nodes > LIMITS.nodes) {
        this.drop("trop d’éléments")
        break
      }
      if (DomUtils.isText(node)) {
        if (!svg || node.data.trim() === "") out.push(node)
        continue
      }
      if (!DomUtils.isTag(node)) {
        if (DomUtils.isComment(node)) this.drop("commentaire")
        continue
      }
      const name = node.name.toLowerCase()
      if (depth > LIMITS.depth) {
        this.drop("imbrication trop profonde")
        continue
      }
      if (DROP.has(name) || (svg && name.startsWith("fe"))) {
        this.drop(`<${name}>`)
        continue
      }
      const inSvg = svg || name === "svg"
      const known = inSvg ? SVG_TAGS.has(name) : HTML_TAGS.has(name)
      if (!known) {
        // An unknown wrapper (font, center, button, picture…) gives way to its content; inside an SVG it goes entirely.
        this.drop(`<${name}>`)
        if (!svg) out.push(...this.children(node.children, depth + 1, inSvg))
        continue
      }
      // The element before its children: the first of two equal ids is the one kept.
      const kept = this.element(node, name, inSvg)
      if (!kept) continue
      const kids = this.children(node.children, depth + 1, inSvg)
      kept.children = kids
      for (const k of kids) k.parent = kept
      out.push(kept)
    }
    return out
  }

  private element(node: Element, name: string, svg: boolean): Element | null {
    const attribs: Record<string, string> = {}
    for (const [rawKey, rawValue] of Object.entries(node.attribs)) {
      const key = rawKey.toLowerCase()
      const value = rawValue ?? ""
      // How an image loads is decided below, from its place in the page: the model's choice is replaced, not refused.
      if (name === "img" && MANAGED_IMG_ATTRS.has(key)) continue
      const allowed = svg ? SVG_ATTRS.has(key) || GLOBAL_ATTRS.has(key) : GLOBAL_ATTRS.has(key) || (TAG_ATTRS[name] ?? []).includes(key)
      const clean = allowed ? this.attribute(name, key, value, svg) : null
      if (clean == null) {
        this.drop(key.startsWith("on") ? "gestionnaire d’événement" : `attribut ${key}`)
        continue
      }
      attribs[key] = clean
    }
    if (name === "a") {
      if (attribs.target === "_blank") attribs.rel = "noopener noreferrer"
      else delete attribs.target
    }
    if (name === "img") return this.image(node, attribs)
    if (attribs.id) {
      if (this.ids.has(attribs.id)) delete attribs.id
      else {
        this.ids.add(attribs.id)
        this.report.ids.push(attribs.id)
      }
    }
    node.attribs = attribs
    node.name = name
    return node
  }

  private attribute(tag: string, key: string, value: string, svg: boolean): string | null {
    if (key === "class") return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1_500) || null
    if (key === "id") return ID.test(value) ? value : null
    if (key === "title" || key === "aria-label") return text(value, 300) || null
    if (key === "role") return ROLES.has(value) ? value : null
    if (key === "aria-hidden") return value === "true" || value === "false" ? value : null
    if (key === "aria-current") return /^(page|step|location|true)$/.test(value) ? value : null
    if (key === "aria-labelledby" || key === "aria-describedby") return value.split(/\s+/).every((v) => ID.test(v)) ? value : null
    if (key === "lang") return /^[a-z]{2}(-[A-Z]{2})?$/.test(value) ? value : null
    if (key === "dir") return value === "ltr" || value === "rtl" ? value : null
    if (svg) {
      if (PAINT_ATTRS.has(key)) return PAINT.test(value.trim()) ? value.trim() : null
      const pattern = SVG_VALUE[key]
      if (pattern) return pattern.test(value) ? value : null
      return NUMBER.test(value.trim()) ? value.trim() : null
    }
    if (key === "href") {
      const link = safeHref(value)
      if (!link) return null
      this.report.links[link.kind]++
      return link.href
    }
    if (key === "target") return value === "_blank" ? value : null
    if (key === "alt") return text(value, 300)
    if (key === "width" || key === "height") return /^\d{1,4}$/.test(value) ? value : null
    if (key === "datetime") return /^[\dT:.+\-Z ]{4,40}$/.test(value) ? value : null
    if (key === "colspan" || key === "rowspan") return /^\d{1,2}$/.test(value) ? value : null
    if (key === "scope") return /^(row|col|rowgroup|colgroup)$/.test(value) ? value : null
    if (key === "start") return /^\d{1,4}$/.test(value) ? value : null
    if (key === "open") return ""
    if (key === "src") return value
    return tag === "abbr" ? text(value, 200) : null
  }

  /** Only the site's own images, with their real size (no layout shift), loaded lazily below the first screen. */
  private image(node: Element, attribs: Record<string, string>): Element | null {
    const name = assetName(attribs.src ?? "")
    const asset = name ? this.opts.assets.get(name) : undefined
    if (!name || !asset) {
      this.drop("image extérieure")
      return null
    }
    const first = this.report.images.every((n) => this.opts.assets.get(n)?.kind === "logo") && asset.kind !== "logo"
    this.report.images.push(name)
    const out: Record<string, string> = { src: `${ASSET_SCHEME}${name}`, alt: attribs.alt ?? "" }
    if (asset.width && asset.height) {
      out.width = String(asset.width)
      out.height = String(asset.height)
    }
    for (const k of ["class", "id", "title", "aria-hidden", "role"]) if (attribs[k] != null) out[k] = attribs[k]
    if (first) out.fetchpriority = "high"
    else if (asset.kind !== "logo") out.loading = "lazy"
    out.decoding = "async"
    node.attribs = out
    node.name = "img"
    return node
  }
}

/** The page's body as the Designer wrote it: inside a ```html block, a whole document or a fragment. */
export function extractBody(answer: string): string {
  const fenced = /```(?:html)?\s*\n([\s\S]*?)```/i.exec(answer)
  const raw = (fenced ? fenced[1] : answer).trim()
  const start = raw.indexOf("<")
  const end = raw.lastIndexOf(">")
  return start >= 0 && end > start ? raw.slice(start, end + 1) : ""
}

function bodyOf(nodes: AnyNode[]): ChildNode[] {
  const body = DomUtils.findOne((n) => n.name.toLowerCase() === "body", nodes as ChildNode[], true)
  return body ? body.children : (nodes as ChildNode[])
}

/** The cleaned body content, and what was removed. */
export function sanitizeBody(html: string, opts: SanitizeOptions): { html: string; report: SanitizeReport } {
  const doc = parseDocument(html.slice(0, LIMITS.inputChars), { lowerCaseTags: true, lowerCaseAttributeNames: true, recognizeSelfClosing: true, decodeEntities: true })
  const cleaner = new Cleaner(opts)
  // The document's own shell (html, head, body) is the CRM's: only what is inside the body is kept.
  const kept = cleaner.children(bodyOf(doc.children), 0, false).filter((n) => !(DomUtils.isTag(n) && (n.name === "html" || n.name === "body")))
  return { html: DomUtils.getOuterHTML(kept, { decodeEntities: true, encodeEntities: "utf8", emptyAttrs: true }), report: cleaner.report }
}
