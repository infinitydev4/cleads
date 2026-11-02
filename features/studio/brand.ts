import { Parser } from "htmlparser2"
import { googleFamilies } from "./fonts"

/**
 * What a page of the prospect's site says about its brand (E23), read in one pass without running anything: the
 * logo, the photos worth showing, the stylesheets and the colour the site declares. Lazy-loaded images (data-src,
 * srcset) and hero backgrounds set in a style attribute count too.
 */
export interface ImageCandidate {
  url: string
  alt: string | null
  /** Declared size, when the page gives one. */
  width: number | null
  height: number | null
  logo: boolean
  /** Higher first: likely logo, then large images near the top. */
  score: number
}

export interface BrandFacts {
  themeColor: string | null
  stylesheets: string[]
  inlineCss: string
  /** Families loaded from Google Fonts. */
  googleFonts: string[]
  images: ImageCandidate[]
}

const LIMITS = { stylesheets: 4, inlineCss: 100_000, images: 40 } as const
const LOGO = /logo|brand|marque|enseigne/i
const SKIP = /(pixel|spacer|blank|loader|loading|spinner|placeholder|sprite|icon-|\/icons?\/|emoji|flag|captcha|gravatar|facebook\.com\/tr|google-analytics|doubleclick|\.ico(\?|$)|data:)/i

function absolute(href: string | undefined, base: string): string | null {
  if (!href) return null
  try {
    const url = new URL(href.trim(), base)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}

/** The largest candidate of a srcset ("a.jpg 480w, b.jpg 1200w"). */
function largest(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined
  let best: { url: string; w: number } | null = null
  for (const part of srcset.split(",")) {
    const [url, size] = part.trim().split(/\s+/)
    const w = size ? parseFloat(size) * (size.endsWith("x") ? 1000 : 1) : 1
    if (url && (!best || w > best.w)) best = { url, w }
  }
  return best?.url
}

const dimension = (v: string | undefined) => {
  const n = v ? parseInt(v, 10) : NaN
  return Number.isFinite(n) && n > 0 && n < 10_000 ? n : null
}

export function parseBrand(html: string, pageUrl: string): BrandFacts {
  const facts: BrandFacts = { themeColor: null, stylesheets: [], inlineCss: "", googleFonts: [], images: [] }
  const seen = new Set<string>()
  let order = 0
  let inStyle = false
  let header = 0
  // Whether each open <a> leads to the home page: a logo is usually the first image inside one, in the header.
  const anchors: boolean[] = []
  const inHomeLink = () => anchors.includes(true)

  const addImage = (raw: string | undefined, attrs: Record<string, string>, hint: { background?: boolean } = {}) => {
    const url = absolute(raw, pageUrl)
    if (!url || seen.has(url) || SKIP.test(url) || facts.images.length >= LIMITS.images) return
    const width = dimension(attrs.width)
    const height = dimension(attrs.height)
    if ((width && width < 48) || (height && height < 32)) return
    seen.add(url)
    const label = `${attrs.alt ?? ""} ${attrs.class ?? ""} ${attrs.id ?? ""} ${url.split("?")[0].split("/").pop() ?? ""}`
    const logo = LOGO.test(label) || (header > 0 && inHomeLink() && order < 3)
    const area = (width ?? 400) * (height ?? 300)
    const score = (logo ? 1_000_000 : 0) + Math.min(area, 2_000_000) / 2_000 + (hint.background ? 400 : 0) - order * 20
    facts.images.push({ url, alt: attrs.alt?.trim() || null, width, height, logo, score })
    order++
  }

  const parser = new Parser(
    {
      onopentag(name, a) {
        if (name === "header") header++
        if (name === "a") anchors.push(/^(\/|\.\/?|#)?$|^\/(index|accueil)/.test((a.href ?? "").trim()) || absolute(a.href, pageUrl) === new URL("/", pageUrl).toString())
        if (name === "meta" && a.name?.toLowerCase() === "theme-color" && a.content) facts.themeColor = a.content.trim().slice(0, 40)
        if (name === "meta" && a.property?.toLowerCase() === "og:image" && a.content) addImage(a.content, {}, { background: true })
        if (name === "link") {
          const rel = (a.rel ?? "").toLowerCase()
          const href = absolute(a.href, pageUrl)
          if (href && rel.includes("stylesheet")) {
            const families = googleFamilies(href)
            if (families.length) facts.googleFonts.push(...families)
            else if (facts.stylesheets.length < LIMITS.stylesheets) facts.stylesheets.push(href)
          }
        }
        if (name === "style") inStyle = true
        if (name === "img") addImage(a["data-src"] || a["data-lazy-src"] || largest(a.srcset || a["data-srcset"]) || a.src, a)
        if (name === "source" && (a.srcset || a["data-srcset"]) && !/svg/.test(a.type ?? "")) addImage(largest(a.srcset || a["data-srcset"]), a)
        const bg = /background(?:-image)?\s*:[^;]*url\(\s*['"]?([^'")]+)/i.exec(a.style ?? "")?.[1] ?? a["data-bg"] ?? a["data-background"]
        if (bg) addImage(bg, a, { background: true })
      },
      ontext(text) {
        if (inStyle && facts.inlineCss.length < LIMITS.inlineCss) facts.inlineCss += text
      },
      onclosetag(name) {
        if (name === "style") inStyle = false
        if (name === "header") header = Math.max(header - 1, 0)
        if (name === "a") anchors.pop()
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true }
  )
  parser.write(html.slice(0, 2_000_000))
  parser.end()
  facts.googleFonts = [...new Set(facts.googleFonts)]
  facts.images.sort((x, y) => y.score - x.score)
  return facts
}

/** @import of Google Fonts inside a stylesheet. */
export const importedFamilies = (css: string) => [...css.matchAll(/@import\s+(?:url\()?\s*['"]?(https:\/\/fonts\.googleapis\.com\/[^'")\s]+)/gi)].flatMap((m) => googleFamilies(m[1]))

const BOOKING_HOSTS = /(^|\.)(doctolib\.fr|planity\.com|calendly\.com|treatwell\.fr|thefork\.fr|lafourchette\.com|zenchef\.com|booksy\.com|kiute\.com|resalib\.fr|maiia\.com|keldoc\.com|clicrdv\.com|rdv360\.com|simplybook\.(?:me|it)|agendize\.com|setmore\.com|youcanbook\.me)$/i

/** An online booking page the site links to, the only external link a page may lead to besides the prospect's own. */
export function bookingLink(links: readonly { href: string; text: string; internal: boolean }[]): string | null {
  for (const l of links) {
    if (l.internal) continue
    try {
      const url = new URL(l.href)
      if (url.protocol === "https:" && BOOKING_HOSTS.test(url.hostname)) return url.toString()
    } catch {
      continue
    }
  }
  return null
}
