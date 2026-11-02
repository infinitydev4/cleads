import { prisma } from "@/lib/prisma"
import { VISIT_MARKER, withAssets } from "./document"
import { onPreviewHost } from "./host"
import { hashToken, TOKEN } from "./link"

export { onPreviewHost }

/**
 * The public side of the Studio Web (docs/crm-v1/AGENTS-IA.md §16): the page behind a link, its images and fonts, and
 * the visit it records. Served on the preview host only, under `Content-Security-Policy: sandbox`: the page has an
 * opaque origin, so it can run no script and read or write no cookie, even on a sub-domain of cleads.fr.
 */
export const VISIT_GAP_MS = 30 * 60_000

const appOrigin = () => {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "https://cleads.fr").origin
  } catch {
    return "https://cleads.fr"
  }
}

/**
 * Security headers of everything a preview serves; `frame` is who may show it in a frame. PageSpeed's copy (`measure`)
 * lets the browser run scripts: Lighthouse measures a page through scripts of its own, and under a plain sandbox it
 * times out (the first real mock-up's PageSpeed answered « Something went wrong » after 2 minutes). The page itself still
 * runs none: `default-src 'none'` refuses every script it could carry, and its origin stays opaque.
 */
export function previewHeaders(frame = appOrigin(), opts: { measure?: boolean } = {}): Record<string, string> {
  return {
    "Content-Security-Policy": [
      `sandbox${opts.measure ? " allow-scripts" : ""} allow-popups allow-popups-to-escape-sandbox allow-top-navigation-to-custom-protocols`,
      "default-src 'none'",
      "img-src 'self' https: data:",
      "style-src 'unsafe-inline'",
      "font-src 'self' https: data:",
      "base-uri 'none'",
      "form-action 'none'",
      `frame-ancestors ${frame}`,
    ].join("; "),
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  }
}

const NOINDEX = '<meta name="robots" content="noindex, nofollow">'

function message(title: string, text: string): string {
  return (
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${NOINDEX}<title>${title}</title>` +
    "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#0f172a;font:16px/1.6 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}" +
    "main{max-width:32rem;padding:2rem;text-align:center}h1{font-size:1.5rem;margin:0 0 .5rem}p{margin:0;color:#475569}strong{color:#0f172a}</style></head>" +
    `<body><main><h1>${title}</h1><p>${text}</p><p style="margin-top:1.5rem;font-size:.875rem">Maquette réalisée par <strong>Cleads</strong></p></main></body></html>`
  )
}

const html = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", ...previewHeaders(), ...extra } })

export const notFound = () => html(message("Maquette introuvable", "Ce lien ne correspond à aucune maquette, ou elle n’est plus disponible."), 404)
const expired = (company: string) => html(message("Maquette expirée", `La maquette réalisée pour ${company.replace(/[<>&"]/g, "")} n’est plus en ligne : demandez un nouveau lien à votre interlocuteur Cleads.`), 410)

type Resolved =
  | { kind: "share"; siteId: string; version: number; companyName: string }
  | { kind: "probe"; siteId: string; version: number }
  | { kind: "expired"; companyName: string }
  | null

/** What a token opens: a shared link (the current version), PageSpeed's short-lived token, or nothing. */
export async function resolveToken(token: string, now = new Date()): Promise<Resolved> {
  if (!TOKEN.test(token)) return null
  const hash = hashToken(token)
  const site = await prisma.generatedSite.findUnique({ where: { tokenHash: hash }, select: { id: true, status: true, currentVersion: true, linkExpiresAt: true, companyName: true } })
  if (site) {
    if (site.status === "PURGED" || !site.currentVersion) return null
    if (!site.linkExpiresAt || site.linkExpiresAt <= now) return { kind: "expired", companyName: site.companyName }
    return { kind: "share", siteId: site.id, version: site.currentVersion, companyName: site.companyName }
  }
  const version = await prisma.generatedSiteVersion.findUnique({ where: { probeHash: hash }, select: { siteId: true, number: true, probeExpiresAt: true } })
  if (version?.probeExpiresAt && version.probeExpiresAt > now) return { kind: "probe", siteId: version.siteId, version: version.number }
  return null
}

/**
 * The page. Its images point under the token (a relative address works on the preview host as under /apercu in
 * development). A shared page carries the visit beacon and noindex; PageSpeed's copy carries neither, so its SEO
 * score measures the page and not the preview's own rule.
 */
export async function servePage(token: string, now = new Date()): Promise<Response> {
  const target = await resolveToken(token, now)
  if (!target) return notFound()
  if (target.kind === "expired") return expired(target.companyName)
  const version = await prisma.generatedSiteVersion.findUnique({ where: { siteId_number: { siteId: target.siteId, number: target.version } }, select: { html: true } })
  if (!version?.html) return notFound()
  let page = withAssets(version.html, (name) => `${token}/a/${name}`)
  if (target.kind === "share") {
    page = page.replace("<head>", `<head>${NOINDEX}`).replace(VISIT_MARKER, `<img src="${token}/vu" alt="" width="1" height="1" decoding="async">`)
    return html(page, 200)
  }
  return new Response(page.replace(VISIT_MARKER, ""), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", ...previewHeaders(undefined, { measure: true }) } })
}

/** An image or a font of the page, for whoever holds a valid token. */
export async function serveAsset(token: string, name: string, now = new Date()): Promise<Response> {
  const target = await resolveToken(token, now)
  if (!target || target.kind === "expired" || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(name)) return new Response(null, { status: 404, headers: previewHeaders() })
  const asset = await prisma.generatedSiteAsset.findUnique({ where: { siteId_name: { siteId: target.siteId, name } }, select: { data: true, mediaType: true } })
  if (!asset) return new Response(null, { status: 404, headers: previewHeaders() })
  return new Response(new Uint8Array(asset.data), { status: 200, headers: { "Content-Type": asset.mediaType, "Cache-Control": "private, max-age=86400", ...previewHeaders() } })
}

const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0))
/** Link checkers, unfurlers and robots: they fetch pages without anyone looking. */
const ROBOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|linkedin|skype|teams|outlook|proofpoint|mimecast|barracuda|safelinks|lighthouse|headlesschrome|python|curl|wget|httpclient|java\//i

/**
 * D25: the page was displayed by a browser, which loaded its beacon. Counted once per half hour per site, with its date
 * only (no cookie, no address); the people who shared it are told in the CRM.
 */
export async function recordVisit(token: string, userAgent: string | null, now = new Date()): Promise<Response> {
  const gif = () => new Response(PIXEL, { status: 200, headers: { "Content-Type": "image/gif", "Cache-Control": "no-store", ...previewHeaders() } })
  const target = await resolveToken(token, now)
  if (target?.kind !== "share" || !userAgent || ROBOT.test(userAgent)) return gif()
  const counted = await prisma.generatedSite.updateMany({
    where: { id: target.siteId, OR: [{ lastVisitAt: null }, { lastVisitAt: { lt: new Date(now.getTime() - VISIT_GAP_MS) } }] },
    data: { visitCount: { increment: 1 }, lastVisitAt: now },
  })
  if (counted.count !== 1) return gif()
  const site = await prisma.generatedSite.findUnique({ where: { id: target.siteId }, select: { workspaceId: true, leadId: true, linkCreatedById: true, createdById: true, visitCount: true, lead: { select: { ownerId: true } } } })
  if (!site) return gif()
  const people = [...new Set([site.linkCreatedById ?? site.createdById, site.lead.ownerId].filter((id): id is string => !!id))]
  const active = await prisma.user.findMany({ where: { id: { in: people }, workspaceId: site.workspaceId, active: true }, select: { id: true } })
  const again = site.visitCount > 1 ? ` (${site.visitCount}ᵉ visite)` : ""
  await prisma.$transaction([
    prisma.generatedSiteVisit.create({ data: { siteId: target.siteId, version: target.version, createdAt: now } }),
    prisma.activity.create({ data: { workspaceId: site.workspaceId, leadId: site.leadId, actorKind: "SYSTEM", kind: "SYSTEM", body: `Maquette du Studio Web ouverte depuis le lien partagé${again}`, data: { siteId: target.siteId, version: target.version }, occurredAt: now } }),
    prisma.notification.createMany({ data: active.map((u) => ({ userId: u.id, type: "SYSTEM", title: "Maquette ouverte", message: `La maquette de ${target.companyName} vient d’être ouverte${again}.` })) }),
  ])
  return gif()
}

/**
 * Crawling is allowed: a shared page keeps itself out of search engines with noindex (header and tag), which a robot
 * only reads if it may fetch the page. A `Disallow: /` here would not deindex anything; it only made PageSpeed's SEO
 * score of the mock-up drop to 66, as if the page itself could not be indexed (seen on the first real mock-up).
 */
export const robotsTxt = () => new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } })
