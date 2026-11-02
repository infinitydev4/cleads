import { collectSite, type PageFetcher, type SiteFacts } from "@/features/prospect-audit/collect"
import { safeFetch } from "@/features/prospect-audit/net"
import { bookingLink, importedFamilies, parseBrand, type ImageCandidate } from "./brand"
import { cssFamilies } from "./fonts"
import { brandColors, cssColors, parseColor, toHex, type FoundColor } from "./palette"
import type { RawImage } from "./render"

/**
 * collect_site for the Studio (E23): the pages the audit reads (robots.txt respected, public addresses only, through
 * features/prospect-audit/net.ts), plus what the brand is made of: stylesheets, colours, fonts, logo and photos.
 * Nothing runs; images are only downloaded, then prepared by the worker's browser.
 */
export const COLLECT_LIMITS = { stylesheetBytes: 500_000, imageBytes: 4_000_000, images: 8 } as const
const IMAGE_TYPES = /^image\/(jpeg|jpg|pjpeg|png|webp|gif|avif|svg\+xml)\b/i

export interface StudioSite {
  site: SiteFacts | null
  /** Each page's raw HTML, by final address. */
  html: Map<string, string>
  colors: FoundColor[]
  fonts: string[]
  images: (RawImage & { sourceUrl: string; alt: string | null })[]
  booking: string | null
  notes: string[]
}

export interface CollectDeps {
  fetchPage?: PageFetcher
}

export async function collectStudioSite(website: string | null, deps: CollectDeps = {}): Promise<StudioSite> {
  const fetchPage = deps.fetchPage ?? safeFetch
  const out: StudioSite = { site: null, html: new Map(), colors: [], fonts: [], images: [], booking: null, notes: [] }
  if (!website) {
    out.notes.push("La fiche n’a pas de site : la maquette part de la fiche Google et de l’audit.")
    return out
  }
  // The pages are read once, by the audit's collector; their HTML is kept on the way.
  const keeping: PageFetcher = async (url, opts) => {
    const res = await fetchPage(url, opts)
    if (res.body && /html|xml/i.test(res.contentType ?? "text/html")) out.html.set(res.finalUrl, res.body)
    return res
  }
  out.site = await collectSite(website, keeping)
  if (!out.site.reachable) {
    out.notes.push(out.site.failure ?? "Le site n’a pas pu être lu.")
    return out
  }

  const brands = out.site.pages.map((p) => ({ page: p, brand: parseBrand(out.html.get(p.url) ?? "", p.url) }))
  const home = brands[0]?.brand
  out.booking = bookingLink(out.site.pages.flatMap((p) => p.links))

  // Colours and fonts: the home page's stylesheets and inline styles, plus the colour the site declares.
  let css = brands.map((b) => b.brand.inlineCss).join("\n")
  for (const href of home?.stylesheets ?? []) {
    try {
      const r = await fetchPage(href, { maxBytes: COLLECT_LIMITS.stylesheetBytes })
      if (r.status >= 200 && r.status < 300 && r.body && /css|text\/plain/i.test(r.contentType ?? "text/css")) css += `\n${r.body}`
    } catch {
      // A stylesheet that cannot be read only leaves fewer colours to choose from.
    }
  }
  const theme = home?.themeColor ? parseColor(home.themeColor) : null
  out.colors = brandColors([...(theme ? [{ hex: toHex(theme), weight: 50, source: "theme" as const }] : []), ...cssColors(css)])
  out.fonts = [...new Set([...brands.flatMap((b) => b.brand.googleFonts), ...importedFamilies(css), ...cssFamilies(css)])].slice(0, 6)

  // Images: the home page's logo, then the best photos of all pages read.
  const candidates = new Map<string, ImageCandidate>()
  for (const { brand } of brands) for (const c of brand.images) if (!candidates.has(c.url)) candidates.set(c.url, c)
  const all = [...candidates.values()].sort((a, b) => b.score - a.score)
  const logo = home?.images.find((c) => c.logo) ?? null
  const photos = all.filter((c) => !c.logo && c.url !== logo?.url)
  let n = 0
  for (const c of [...(logo ? [logo] : []), ...photos]) {
    if (out.images.length >= COLLECT_LIMITS.images + 1) break
    const isLogo = c === logo
    try {
      const r = await fetchPage(c.url, { binary: IMAGE_TYPES, maxBytes: COLLECT_LIMITS.imageBytes })
      if (!r.data?.length || r.truncated || r.status < 200 || r.status >= 300) continue
      out.images.push({ name: isLogo ? "logo" : `image-${++n}`, kind: isLogo ? "logo" : "image", data: r.data, mediaType: (r.contentType ?? "").split(";")[0].trim().toLowerCase(), sourceUrl: r.finalUrl, alt: c.alt })
    } catch {
      // An image that cannot be downloaded is left out.
    }
  }
  if (!logo) out.notes.push("Aucun logo n’a été trouvé sur le site : la maquette écrit le nom de l’entreprise.")
  if (!out.images.some((i) => i.kind === "image")) out.notes.push("Aucune photo utilisable sur le site : la maquette utilise des fonds neutres.")
  return out
}
