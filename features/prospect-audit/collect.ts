import { BOT_TOKEN, FetchRefused, safeFetch, type FetchOptions, type FetchResult } from "./net"
import { EMPTY_ROBOTS, aiBotsAccess, isAllowed, parseRobots, type Robots } from "./robots"
import { parsePage, type PageFacts } from "./html"
import { detectStack, type StackFacts } from "./stack"

/**
 * fetch_page (docs/crm-v1/AGENTS-IA.md §9): five pages at most, the home page then the ones that matter for an audit
 * (contact, services, prices, about, FAQ), only where robots.txt lets us in. A site that cannot be read gives a
 * partial audit that says why, never an error.
 */
export const MAX_PAGES = 5

export interface SiteFacts {
  input: string
  reachable: boolean
  /** Why the site could not be read, in words for the closer. */
  failure: string | null
  blockedByRobots: boolean
  finalUrl: string | null
  https: boolean
  status: number | null
  redirects: number
  timeMs: number | null
  htmlBytes: number | null
  robotsFound: boolean
  aiBots: { bot: string; allowed: boolean }[]
  sitemap: boolean
  llmsTxt: boolean
  pages: PageFacts[]
  stack: StackFacts | null
}

export type PageFetcher = (url: string, opts?: FetchOptions) => Promise<FetchResult>

const KEYWORDS: [RegExp, number][] = [
  [/contact|devis|rendez-vous|rdv|reserv|booking/i, 5],
  [/service|prestation|offre|solution|metier|savoir-faire|travaux|nos-/i, 4],
  [/tarif|prix|price/i, 3],
  [/a-propos|qui-sommes|about|presentation|entreprise|equipe|histoire/i, 3],
  [/faq|questions/i, 3],
  [/realisation|references|portfolio|projets|avis|temoignage/i, 2],
]
const SKIP = /\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3)$|\/(wp-admin|wp-login|panier|cart|checkout|mon-compte|account|login|connexion|feed)\b|[?&](add-to-cart|replytocom)=/i

/** The internal pages worth reading, best first; never the same path twice. */
export function choosePages(home: PageFacts, robots: Robots, max = MAX_PAGES - 1): string[] {
  const homePath = new URL(home.url).pathname.replace(/\/$/, "")
  const seen = new Set<string>([homePath])
  const scored: { url: string; score: number }[] = []
  for (const link of home.links) {
    if (!link.internal) continue
    let url: URL
    try {
      url = new URL(link.href)
    } catch {
      continue
    }
    const path = url.pathname.replace(/\/$/, "")
    if (seen.has(path) || SKIP.test(url.pathname + url.search) || !isAllowed(robots, BOT_TOKEN, url.pathname)) continue
    seen.add(path)
    const haystack = `${url.pathname} ${link.text}`
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
    const score = KEYWORDS.reduce((s, [re, w]) => (re.test(haystack) ? s + w : s), 0)
    if (score > 0) scored.push({ url: `${url.origin}${url.pathname}`, score })
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((s) => s.url)
}

const isHtml = (r: FetchResult) => r.status >= 200 && r.status < 300 && !!r.body && /html|xml/i.test(r.contentType ?? "text/html")

export async function collectSite(input: string, fetchPage: PageFetcher = safeFetch): Promise<SiteFacts> {
  const facts: SiteFacts = {
    input,
    reachable: false,
    failure: null,
    blockedByRobots: false,
    finalUrl: null,
    https: false,
    status: null,
    redirects: 0,
    timeMs: null,
    htmlBytes: null,
    robotsFound: false,
    aiBots: [],
    sitemap: false,
    llmsTxt: false,
    pages: [],
    stack: null,
  }
  let robots = EMPTY_ROBOTS
  const origin = new URL(input).origin
  try {
    const r = await fetchPage(`${origin}/robots.txt`)
    if (r.status >= 200 && r.status < 300 && r.body && !/html/i.test(r.contentType ?? "")) {
      robots = parseRobots(r.body)
      facts.robotsFound = true
    }
  } catch {
    // No robots.txt: everything is allowed (RFC 9309).
  }
  facts.aiBots = aiBotsAccess(robots)
  if (!isAllowed(robots, BOT_TOKEN, new URL(input).pathname || "/")) {
    facts.blockedByRobots = true
    facts.failure = "Le site demande aux robots de ne pas le lire (robots.txt) : ses pages n'ont pas été lues."
    return facts
  }

  let home: FetchResult
  try {
    home = await fetchPage(input)
  } catch (error) {
    facts.failure = error instanceof FetchRefused ? `Site injoignable : ${error.message}` : "Site injoignable"
    return facts
  }
  facts.status = home.status
  facts.finalUrl = home.finalUrl
  facts.https = home.finalUrl.startsWith("https:")
  facts.redirects = home.redirects.length
  facts.timeMs = home.timeMs
  facts.htmlBytes = home.bytes
  if (!isHtml(home)) {
    facts.failure = home.status >= 400 ? `Le site répond par une erreur ${home.status}.` : "La page d'accueil n'est pas une page web lisible."
    return facts
  }
  facts.reachable = true
  const first = parsePage(home.body!, home.finalUrl)
  facts.pages.push(first)

  for (const url of choosePages(first, robots)) {
    try {
      const r = await fetchPage(url)
      if (isHtml(r)) facts.pages.push(parsePage(r.body!, r.finalUrl))
    } catch {
      // A page that fails is left out; the home page is enough for a partial reading.
    }
  }

  const finalOrigin = new URL(home.finalUrl).origin
  const exists = async (url: string) => {
    try {
      const r = await fetchPage(url, { headOnly: true })
      return r.status >= 200 && r.status < 300 && !/html/i.test(r.contentType ?? "")
    } catch {
      return false
    }
  }
  const sitemap = robots.sitemaps.find((s) => s.startsWith(finalOrigin)) ?? `${finalOrigin}/sitemap.xml`
  ;[facts.sitemap, facts.llmsTxt] = await Promise.all([exists(sitemap), exists(`${finalOrigin}/llms.txt`)])
  facts.stack = detectStack(facts.pages)
  return facts
}
