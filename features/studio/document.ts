import { ASSET_SCHEME } from "./sanitize"
import { RESET_CSS } from "./tailwind"

/**
 * The published document around a generated body (E23): the head, the CSS and the banner are the CRM's, never the
 * model's. Images and fonts stay referenced as `cleads-asset:<name>` until the page is served: then they point to
 * the preview link, or are inlined for the internal preview (features/studio/preview.ts).
 */
export const VISIT_MARKER = "<!--cleads:visit-->"
/** Around the generated body, so a revision starts from it and not from the CRM's banner. */
const BODY_START = "<!--cleads:body-->"
const BODY_END = "<!--/cleads:body-->"
const BANNER_CLASS = "cleads-maquette"

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

/** The banner the page always shows: whoever receives the link knows what it is. */
const BANNER_CSS =
  `.${BANNER_CLASS}{position:relative;display:flex;align-items:center;justify-content:center;gap:.5rem;padding:.5rem 1rem;` +
  "background:#0f172a;color:#e2e8f0;font:500 13px/1.4 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;text-align:center}" +
  `.${BANNER_CLASS} strong{color:#fff;font-weight:600}.${BANNER_CLASS} img{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}`

export function bannerText(company: string): string {
  return `Maquette non contractuelle réalisée par Cleads pour ${company}`
}

export interface DocumentParts {
  company: string
  description: string
  body: string
  css: string
  fontCss: string
  /** Text colour of the page, and its body font stack. */
  ink: string
  fontFamily: string
}

export function assembleDocument(p: DocumentParts): string {
  const banner = `<div class="${BANNER_CLASS}" role="note"><span>Maquette non contractuelle réalisée par <strong>Cleads</strong> pour ${escape(p.company)}</span>${VISIT_MARKER}</div>`
  const base = `html{font-family:${p.fontFamily}}body{color:${p.ink};background:#fff;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}`
  return (
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer">` +
    `<title>${escape(p.company)} · maquette Cleads</title><meta name="description" content="${escape(p.description.slice(0, 160))}">` +
    `<style>${p.fontCss}${RESET_CSS}${base}${p.css}${BANNER_CSS}</style></head><body>${banner}${BODY_START}${p.body}${BODY_END}</body></html>`
  )
}

/** The generated body of a stored page; null when the page has none (purged). */
export function pageBody(html: string | null): string | null {
  if (!html) return null
  const start = html.indexOf(BODY_START)
  const end = html.lastIndexOf(BODY_END)
  return start >= 0 && end > start ? html.slice(start + BODY_START.length, end) : null
}

/** Asset references in a stored page, rewritten for where it is served. */
export function withAssets(html: string, url: (name: string) => string | null): string {
  return html.replace(new RegExp(`${ASSET_SCHEME}([a-z0-9][a-z0-9-]{0,39})`, "g"), (_, name: string) => url(name) ?? "data:,")
}

export interface StaticChecks {
  h1: number
  /** Content images with an empty text alternative. */
  emptyAlt: number
  phoneLink: boolean
  emailLink: boolean
  /** Text a page should never show: placeholders left by the model. */
  placeholders: string[]
  bytes: number
}

/**
 * Text that speaks to the team instead of the visitor (« à fournir par le cabinet », « horaires à confirmer »). The first
 * real mock-up showed such notes on the page: the brief keeps them in « À vérifier », and a page that still shows one is
 * corrected.
 */
export const TEAM_NOTE =
  /(?:^|[^\p{L}])(?:à|a) (?:fournir|confirmer|compléter|completer|ajouter|préciser|preciser|vérifier|verifier|détailler|detailler|reprendre|valider|demander)(?![\p{L}])|(?:^|[^\p{L}])non (?:fourni|communiqué|renseigné|précisé)e?s?(?![\p{L}])|rien n['’]est inventé|(?:^|[^\p{L}])(?:sera|seront) (?:ajouté|complété|précisé|confirmé)e?s?(?![\p{L}])|avant (?:la )?publication/iu

const PLACEHOLDERS = [/lorem ipsum/i, /\{\{[^}]*\}\}/, /\[(?:à compléter|a completer|insérer|inserer|todo|xx+)[^\]]*\]/i, /\bXX\s?XX\b/, /0[1-9](?:[ .]?00){4}/, TEAM_NOTE]

function sentenceAround(text: string, at: number): string {
  const start = Math.max(text.lastIndexOf(".", at), text.lastIndexOf("\n", at), 0)
  const end = text.indexOf(".", at)
  return text.slice(start === 0 ? 0 : start + 1, end < 0 ? at + 80 : end + 1)
}

/** What can be checked in the markup itself, before any rendering. */
export function staticChecks(body: string, logo: string | null): StaticChecks {
  const imgs = [...body.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
  const textOnly = body.replace(/<[^>]+>/g, " ")
  return {
    h1: (body.match(/<h1\b/g) ?? []).length,
    emptyAlt: imgs.filter((i) => /\balt=""/.test(i) && !(logo && i.includes(`${ASSET_SCHEME}${logo}"`))).length,
    phoneLink: /href="tel:/.test(body),
    emailLink: /href="mailto:/.test(body),
    placeholders: PLACEHOLDERS.flatMap((re) => {
      const m = re.exec(textOnly)
      // The sentence around a note for the team, so the correction knows what to remove.
      return m ? [re === TEAM_NOTE ? sentenceAround(textOnly, m.index) : m[0]] : []
    }).map((s) => s.replace(/\s+/g, " ").trim().slice(0, 120)),
    bytes: Buffer.byteLength(body, "utf8"),
  }
}
