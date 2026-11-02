/**
 * Typefaces for the Studio Web (E23). A page uses at most two families, taken from Google Fonts and hosted with the
 * page: the prospect's visitors never call Google, and the page loads nothing from anywhere else. The Designer picks
 * from a short list of families that read well in French, or from the ones the prospect's site already loads.
 */
export const FONT_CATALOG = {
  sans: ["Inter", "Manrope", "DM Sans", "Plus Jakarta Sans", "Outfit", "Figtree", "Poppins", "Montserrat", "Lato", "Open Sans", "Source Sans 3", "Nunito Sans", "Work Sans", "Raleway", "Rubik", "Barlow", "Archivo", "Sora", "Urbanist", "Lexend", "Karla"],
  serif: ["Playfair Display", "Fraunces", "Lora", "Merriweather", "Cormorant Garamond", "DM Serif Display", "Libre Baskerville", "EB Garamond", "Source Serif 4", "Spectral", "Bitter"],
  display: ["Bebas Neue", "Oswald", "Space Grotesk"],
} as const

export const CATALOG_FAMILIES: readonly string[] = [...FONT_CATALOG.sans, ...FONT_CATALOG.serif, ...FONT_CATALOG.display]
export const DEFAULT_FONTS = { heading: "Inter", body: "Inter" } as const

const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 ]{1,39}$/
export const isFamilyName = (name: string) => FAMILY.test(name)

const SERIF = new Set<string>(FONT_CATALOG.serif)
/** The family first, then fallbacks of the same kind, so text shows at once and keeps its shape. */
export function fontStack(family: string): string {
  const fallback = SERIF.has(family) ? 'ui-serif, Georgia, Cambria, "Times New Roman", serif' : 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
  return `"${family}", ${fallback}`
}

const GENERIC = /^(inherit|initial|unset|serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|-apple-system|blinkmacsystemfont|arial|arial black|helvetica|helvetica neue|verdana|tahoma|georgia|times|times new roman|segoe ui|courier|courier new|microsoft sans serif|calibri|cambria|candara|consolas|constantia|corbel|trebuchet ms|lucida.*|palatino.*|book antiqua|century gothic|garamond|impact|optima|futura|avenir.*|comic sans ms|monaco|menlo|sf pro.*|symbol|wingdings|webdings|var\(.*)$/i
/** Icon fonts, often the most declared family of a stylesheet: never a text font. */
const ICON_FONT = /awesome|icon|glyph|dashicons|eicons|material symbols|ionicons|linearicons|themify|elegant|simple-line|feather|swiper|slick/i

/** Families a stylesheet sets (first of each font-family list), most used first; system fonts left out. */
export function cssFamilies(css: string): string[] {
  const counts = new Map<string, number>()
  for (const m of css.slice(0, 600_000).matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const first = m[1].split(",")[0].trim().replace(/^["']|["']$/g, "").replace(/\s*!important$/i, "").trim()
    if (!first || GENERIC.test(first) || ICON_FONT.test(first) || !isFamilyName(first)) continue
    counts.set(first, (counts.get(first) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([f]) => f)
}

/** Families named in a Google Fonts address, both API versions ("Open+Sans:400,700|Lato" or "family=Lato:wght@400"). */
export function googleFamilies(href: string): string[] {
  let url: URL
  try {
    url = new URL(href, "https://fonts.googleapis.com")
  } catch {
    return []
  }
  if (url.hostname !== "fonts.googleapis.com") return []
  return url.searchParams
    .getAll("family")
    .flatMap((f) => f.split("|"))
    .map((f) => f.split(":")[0].replace(/\+/g, " ").trim())
    .filter(isFamilyName)
}

export interface FontFace {
  family: string
  weight: string
  style: string
  url: string
}

/**
 * The faces of a Google Fonts stylesheet that cover French: the « latin » subset (accents, œ, €). A variable family
 * lists one face per weight on the same file: each file is downloaded once.
 */
export function latinFaces(css: string): FontFace[] {
  const faces: FontFace[] = []
  for (const m of css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/gi)) {
    if (m[1] !== "latin") continue
    const body = m[2]
    const get = (prop: string) => new RegExp(`${prop}\\s*:\\s*([^;]+);`, "i").exec(body)?.[1].trim() ?? null
    const family = get("font-family")?.replace(/^["']|["']$/g, "")
    const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+\.woff2)\)/i.exec(body)?.[1]
    const weight = get("font-weight") ?? "400"
    if (!family || !url || !/^\d{3}( \d{3})?$/.test(weight)) continue
    faces.push({ family, weight, style: get("font-style") === "italic" ? "italic" : "normal", url })
  }
  return faces.filter((f) => f.style === "normal")
}

export const FONT_LIMITS = { files: 6, bytes: 400_000, timeoutMs: 10_000 } as const

const titleCase = (family: string) => family.replace(/\b\p{L}/gu, (c) => c.toUpperCase())

/** Google answers woff2 only to a browser it knows. */
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

export interface DownloadedFont {
  family: string
  /** "400", or "100 900" for a variable file. */
  weights: string[]
  url: string
  data: Uint8Array
}

/**
 * Downloads the files of the families, for the weights a page uses (headings bolder than text). The hosts are fixed
 * (Google's), so no address check is needed. A family Google does not know is skipped: the page falls back to the
 * system fonts of its stack.
 */
export async function downloadFonts(families: { family: string; weights: number[] }[], fetchImpl: typeof fetch = fetch): Promise<{ fonts: DownloadedFont[]; errors: string[] }> {
  const fonts: DownloadedFont[] = []
  const errors: string[] = []
  for (const { family, weights } of families) {
    if (!isFamilyName(family)) continue
    const name = family.replace(/ /g, "+")
    let faces: FontFace[] = []
    for (const query of [`${name}:wght@${[...new Set(weights)].sort().join(";")}`, name]) {
      try {
        const res = await fetchImpl(`https://fonts.googleapis.com/css2?family=${query}&display=swap`, { headers: { "User-Agent": BROWSER_UA, Accept: "text/css" }, signal: AbortSignal.timeout(FONT_LIMITS.timeoutMs) })
        if (res.ok) faces = latinFaces(await res.text())
      } catch {
        // Tried again without weights, then given up.
      }
      if (faces.length) break
    }
    if (!faces.length) {
      errors.push(`Police « ${family} » introuvable sur Google Fonts : les polices du système la remplacent.`)
      continue
    }
    for (const url of [...new Set(faces.map((f) => f.url))]) {
      if (fonts.length >= FONT_LIMITS.files) break
      try {
        const res = await fetchImpl(url, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(FONT_LIMITS.timeoutMs) })
        const data = new Uint8Array(await res.arrayBuffer())
        if (!res.ok || data.length === 0 || data.length > FONT_LIMITS.bytes) throw new Error("taille")
        fonts.push({ family, weights: faces.filter((f) => f.url === url).map((f) => f.weight), url, data })
      } catch {
        errors.push(`Un fichier de la police « ${family} » n’a pas pu être téléchargé.`)
      }
    }
  }
  return { fonts, errors }
}

/**
 * Among a site's families, the ones Google Fonts serves, by their exact name there: the first real mock-up chose a
 * Windows font (« Microsoft Sans Serif ») that no page can host. A family Google does not know is not offered.
 */
export async function googleServes(families: readonly string[], fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const out: string[] = []
  for (const family of families.slice(0, 6)) {
    const known = CATALOG_FAMILIES.find((f) => f.toLowerCase() === family.toLowerCase())
    if (known) {
      out.push(known)
      continue
    }
    for (const name of [...new Set([family, titleCase(family)])]) {
      try {
        const res = await fetchImpl(`https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}&display=swap`, { headers: { "User-Agent": BROWSER_UA, Accept: "text/css" }, signal: AbortSignal.timeout(FONT_LIMITS.timeoutMs) })
        const faces = res.ok ? latinFaces(await res.text()) : []
        if (faces.length) {
          out.push(faces[0].family)
          break
        }
      } catch {
        // Unknown or unreachable: not offered.
      }
    }
  }
  return [...new Set(out)]
}

/** @font-face rules for fonts hosted with the page: `asset` is the name the page knows the file by. */
export function fontFaceCss(fonts: readonly { family: string; weights: string[]; asset: string }[]): string {
  return fonts
    .flatMap((f) => {
      const variable = f.weights.find((w) => w.includes(" "))
      const weights = variable ? [variable] : [...new Set(f.weights)]
      return weights.map((w) => `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${w};font-display:swap;src:url(cleads-asset:${f.asset}) format("woff2")}`)
    })
    .join("")
}
