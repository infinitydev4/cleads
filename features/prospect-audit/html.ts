import { Parser } from "htmlparser2"

/**
 * What one page of the prospect's site says, read in a single pass without running anything: the tags that matter for
 * the audit, the links, the structured data and the visible text (for the extraction step, which treats it as
 * untrusted content).
 */
export interface PageFacts {
  url: string
  lang: string | null
  title: string | null
  description: string | null
  canonical: string | null
  robotsMeta: string | null
  viewport: string | null
  generator: string | null
  openGraph: boolean
  h1: string[]
  h2: string[]
  jsonLdTypes: string[]
  /** JSON-LD blocks that do not parse. */
  jsonLdErrors: number
  scripts: string[]
  /** The beginning of inline scripts, for tag detection (gtag, fbq…). */
  inlineScripts: string
  /** Stylesheets, images and other assets: CMS traces (wp-content…). */
  assets: string[]
  links: { href: string; text: string; internal: boolean }[]
  tel: string[]
  mailto: string[]
  iframes: string[]
  forms: number
  images: number
  imagesWithoutAlt: number
  /** The most recent year next to a © or "copyright". */
  copyrightYear: number | null
  text: string
  wordCount: number
}

const SKIP_TEXT = new Set(["script", "style", "noscript", "svg", "template", "iframe", "head"])
const LIMITS = { links: 300, scripts: 80, assets: 80, inline: 20_000, text: 20_000, headings: 20 }

const squash = (s: string) => s.replace(/\s+/g, " ").trim()

function absolute(href: string, base: string): string | null {
  try {
    const url = new URL(href, base)
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

function jsonLdTypes(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6 || !value || typeof value !== "object") return
  if (Array.isArray(value)) {
    for (const v of value.slice(0, 50)) jsonLdTypes(v, out, depth + 1)
    return
  }
  const t = (value as Record<string, unknown>)["@type"]
  for (const x of Array.isArray(t) ? t : [t]) if (typeof x === "string" && x.length < 60) out.add(x)
  for (const v of Object.values(value as Record<string, unknown>)) if (v && typeof v === "object") jsonLdTypes(v, out, depth + 1)
}

export function parsePage(html: string, url: string): PageFacts {
  const host = new URL(url).hostname.replace(/^www\./, "")
  const facts: PageFacts = {
    url,
    lang: null,
    title: null,
    description: null,
    canonical: null,
    robotsMeta: null,
    viewport: null,
    generator: null,
    openGraph: false,
    h1: [],
    h2: [],
    jsonLdTypes: [],
    jsonLdErrors: 0,
    scripts: [],
    inlineScripts: "",
    assets: [],
    links: [],
    tel: [],
    mailto: [],
    iframes: [],
    forms: 0,
    images: 0,
    imagesWithoutAlt: 0,
    copyrightYear: null,
    text: "",
    wordCount: 0,
  }
  const types = new Set<string>()
  const stack: string[] = []
  let skipDepth = 0
  let capture: { tag: "title" | "h1" | "h2" | "a" | "ldjson" | "script"; text: string; href?: string } | null = null
  const textParts: string[] = []
  let textLength = 0

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        stack.push(name)
        if (SKIP_TEXT.has(name)) skipDepth++
        switch (name) {
          case "html":
            facts.lang = attrs.lang?.slice(0, 20) || null
            break
          case "title":
            if (!facts.title) capture = { tag: "title", text: "" }
            break
          case "h1":
          case "h2":
            capture = { tag: name, text: "" }
            break
          case "meta": {
            const key = (attrs.name ?? attrs.property ?? "").toLowerCase()
            const content = squash(attrs.content ?? "").slice(0, 500)
            if (key === "description" && !facts.description) facts.description = content || null
            else if (key === "viewport") facts.viewport = content || null
            else if (key === "robots") facts.robotsMeta = content || null
            else if (key === "generator") facts.generator = content || null
            else if (key.startsWith("og:")) facts.openGraph = true
            break
          }
          case "link": {
            const rel = (attrs.rel ?? "").toLowerCase()
            const href = attrs.href ? absolute(attrs.href, url) : null
            if (rel.split(/\s+/).includes("canonical") && href) facts.canonical = href
            else if (href && facts.assets.length < LIMITS.assets) facts.assets.push(href)
            break
          }
          case "script": {
            const type = (attrs.type ?? "").toLowerCase()
            if (type === "application/ld+json") capture = { tag: "ldjson", text: "" }
            else if (attrs.src) {
              const src = absolute(attrs.src, url)
              if (src && facts.scripts.length < LIMITS.scripts) facts.scripts.push(src)
            } else capture = { tag: "script", text: "" }
            break
          }
          case "a": {
            const href = attrs.href?.trim() ?? ""
            if (/^tel:/i.test(href)) facts.tel.push(href.slice(4).replace(/\s+/g, "").slice(0, 30))
            else if (/^mailto:/i.test(href)) facts.mailto.push(href.slice(7).split("?")[0].slice(0, 120).toLowerCase())
            else {
              const abs = absolute(href, url)
              if (abs && /^https?:/i.test(abs)) capture = { tag: "a", text: "", href: abs }
            }
            break
          }
          case "img":
            facts.images++
            if (!attrs.alt?.trim()) facts.imagesWithoutAlt++
            if (attrs.src && facts.assets.length < LIMITS.assets) {
              const src = absolute(attrs.src, url)
              if (src) facts.assets.push(src)
            }
            break
          case "iframe":
            if (attrs.src) {
              const src = absolute(attrs.src, url)
              if (src && facts.iframes.length < 20) facts.iframes.push(src)
            }
            break
          case "form":
            facts.forms++
            break
        }
      },
      ontext(text) {
        if (capture) capture.text += text
        if (skipDepth === 0 && textLength < LIMITS.text) {
          const t = squash(text)
          if (t) {
            textParts.push(t)
            textLength += t.length + 1
          }
        }
      },
      onclosetag(name) {
        stack.pop()
        if (SKIP_TEXT.has(name)) skipDepth = Math.max(0, skipDepth - 1)
        if (!capture) return
        const c = capture
        if (name === "title" && c.tag === "title") {
          facts.title = squash(c.text).slice(0, 300) || null
          capture = null
        } else if ((name === "h1" || name === "h2") && c.tag === name) {
          const list = facts[name]
          const t = squash(c.text).slice(0, 200)
          if (t && list.length < LIMITS.headings) list.push(t)
          capture = null
        } else if (name === "a" && c.tag === "a") {
          if (facts.links.length < LIMITS.links) {
            let internal = false
            try {
              internal = new URL(c.href!).hostname.replace(/^www\./, "") === host
            } catch {
              internal = false
            }
            facts.links.push({ href: c.href!, text: squash(c.text).slice(0, 120), internal })
          }
          capture = null
        } else if (name === "script" && (c.tag === "ldjson" || c.tag === "script")) {
          if (c.tag === "ldjson") {
            try {
              jsonLdTypes(JSON.parse(c.text), types)
            } catch {
              facts.jsonLdErrors++
            }
          } else if (facts.inlineScripts.length < LIMITS.inline) {
            facts.inlineScripts += c.text.slice(0, LIMITS.inline - facts.inlineScripts.length) + "\n"
          }
          capture = null
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true }
  )
  parser.write(html)
  parser.end()

  facts.jsonLdTypes = [...types].slice(0, 30)
  facts.tel = [...new Set(facts.tel)].slice(0, 10)
  facts.mailto = [...new Set(facts.mailto)].slice(0, 10)
  facts.text = textParts.join(" ").slice(0, LIMITS.text)
  facts.wordCount = facts.text ? facts.text.split(" ").length : 0
  const years = [...facts.text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map((m) => Number(m[1]))
  facts.copyrightYear = years.length ? Math.max(...years) : null
  return facts
}

const NETWORKS: [string, RegExp][] = [
  ["facebook", /(^|\.)facebook\.com$|(^|\.)fb\.com$/],
  ["instagram", /(^|\.)instagram\.com$/],
  ["linkedin", /(^|\.)linkedin\.com$/],
  ["x", /(^|\.)(twitter|x)\.com$/],
  ["youtube", /(^|\.)youtube\.com$|(^|\.)youtu\.be$/],
  ["tiktok", /(^|\.)tiktok\.com$/],
  ["pinterest", /(^|\.)pinterest\.[a-z.]+$/],
]

/** Which network a link points to, if it is a profile (sharing links are left out). */
export function networkOf(href: string): string | null {
  try {
    const url = new URL(href)
    if (/\/(share|sharer|intent|dialog)/i.test(url.pathname)) return null
    const host = url.hostname.toLowerCase()
    return NETWORKS.find(([, re]) => re.test(host))?.[0] ?? null
  } catch {
    return null
  }
}

/** A website that is only a social profile ("facebook.com/plomberie-martin"). */
export const isSocialProfile = (site: string | null | undefined) => !!site && !!networkOf(/^https?:/i.test(site) ? site : `https://${site}`)
