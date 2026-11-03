import type { FrozenSite } from "@/evals/sites"
import type { PageFetcher } from "@/features/prospect-audit/collect"
import { isSocialProfile } from "@/features/prospect-audit/html"
import { FetchRefused, siteUrl, type FetchResult } from "@/features/prospect-audit/net"
import { reportUrl, type PsiResult, type Strategy } from "@/features/prospect-audit/pagespeed"
import type { AuditFacts, Listing } from "@/features/prospect-audit/rules"

/**
 * The Auditeur's frozen world (E27): its pages, its PageSpeed figures and its listing served from evals/sites.ts, so
 * an evaluation reads the same thing every time and reaches no network.
 */

/** The date the frozen sites are judged at: « a copyright three years old » stays true whenever the set is run. */
export const EVAL_NOW = new Date("2026-11-01T09:00:00Z")

const html = "text/html; charset=utf-8"

export function frozenFetcher(site: FrozenSite): PageFetcher {
  const start = siteUrl(site.website)
  const final = site.finalUrl ?? start
  return async (url, opts) => {
    if (site.down) throw new FetchRefused("dns", "le nom de domaine ne répond pas")
    const target = new URL(url)
    const home = start && new URL(start)
    if (!home || target.hostname.replace(/^www\./, "") !== home.hostname.replace(/^www\./, "")) throw new FetchRefused("network", "adresse hors du site figé")
    const path = target.pathname.replace(/\/$/, "") || "/"
    const answer = (status: number, body: string | null, contentType: string | null, finalUrl = url, redirects: string[] = []): FetchResult => ({
      url,
      finalUrl,
      status,
      redirects,
      contentType,
      body: opts?.headOnly ? null : body,
      bytes: body?.length ?? 0,
      truncated: false,
      timeMs: 380,
    })
    if (path === "/robots.txt") return site.robots ? answer(200, site.robots, "text/plain") : answer(404, "Introuvable", html)
    if (path === "/sitemap.xml") return site.sitemap ? answer(200, "<urlset></urlset>", "application/xml") : answer(404, "Introuvable", html)
    if (path === "/llms.txt") return site.llmsTxt ? answer(200, `# ${site.name}`, "text/plain") : answer(404, "Introuvable", html)
    const body = site.pages[path]
    // The home page is reached through the site's redirections, if it has any.
    if (path === "/" && body && final && url === start) return answer(200, body, html, final, site.redirects ?? [])
    return body ? answer(200, body, html) : answer(404, "<h1>Page introuvable</h1>", html)
  }
}

/** PageSpeed as frozen, with the screenshots the worker's browser took of the frozen page, if any. */
export function frozenPsi(site: FrozenSite, strategy: Strategy, screenshot: Buffer | null = null): PsiResult {
  const url = site.finalUrl ?? siteUrl(site.website) ?? ""
  if (!site.psi) return { ok: false, strategy, error: "Mesure PageSpeed indisponible pour ce site" }
  const home = site.pages["/"] ?? ""
  return {
    ok: true,
    strategy,
    finalUrl: url,
    scores: { performance: strategy === "mobile" ? site.psi.mobile : site.psi.desktop, accessibility: 88, bestPractices: 92, seo: 90 },
    lab: { lcpMs: strategy === "mobile" ? site.psi.lcpMs : Math.round(site.psi.lcpMs / 2.4), cls: 0.04, tbtMs: 180, fcpMs: 1_600 },
    field: null,
    viewport: /name="viewport"/.test(home),
    screenshot: screenshot ? { data: screenshot, mediaType: "image/jpeg" } : null,
    reportUrl: reportUrl(url, strategy),
  }
}

export function frozenListing(site: FrozenSite): Listing {
  return {
    name: site.name,
    phone: site.listing.phone,
    website: site.website,
    rating: site.listing.rating,
    reviewCount: site.listing.reviewCount,
    category: site.sector,
    city: site.city,
    postalCode: site.postalCode,
    socials: site.listing.socials ?? [],
    sourceUrl: null,
    // Prospects come from the Extractor: its listing is what the audit compares the site with.
    fromExtractor: true,
  }
}

/** The facts the audit starts from, before its reading step: the site as collected, PageSpeed, no registry. */
export function frozenFacts(site: FrozenSite, collected: AuditFacts["site"], psi: AuditFacts["psi"]): AuditFacts {
  return {
    sector: site.sector,
    listing: frozenListing(site),
    website: siteUrl(site.website),
    socialOnly: isSocialProfile(siteUrl(site.website)),
    site: collected,
    psi,
    registry: null,
    registryError: null,
  }
}
