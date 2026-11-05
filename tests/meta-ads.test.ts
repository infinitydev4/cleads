// E30 lot 3: Meta's Ad Library, its pure parts — the request (the token never in an address), the answers and errors,
// the token's check, the page a company is tied to, and what the fiche and the offers keep. Nothing leaves the machine.
import { describe, expect, it } from "vitest"
import { META_ADS_SOURCE, checkToken, domainOf, failureOf, parseAds, searchAds, tokenPrint, type MetaAd } from "@/features/enrichment/sources/meta-ads"
import { adsData, adsSummary, matchPage, pageIdOf, tokenNotice } from "@/features/signals/ads"
import { OFFER_SIGNALS, isOfferSignal } from "@/features/offers/signals"
import { OFFERS_V1 } from "@/features/offers/catalog-v1"
import { CATALOG_VERSION } from "@/features/ai/catalog"
import { SIGNAL_LABELS } from "@/features/signals/kinds"

const TOKEN = "EAAtestTOKENnotreal123456"
const now = new Date("2026-11-05T10:00:00Z")

/** A fake Graph API: records each call, answers from a function. */
function graph(answer: (url: URL) => { status?: number; body: unknown }) {
  const calls: { url: string; auth: string | null }[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") })
    const a = answer(new URL(url))
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200, headers: { "content-type": "application/json" } })
  }) as typeof fetch
  return { calls, fetchImpl }
}

const raw = (o: { id: string; page: string; name: string; start?: string; platforms?: string[]; captions?: string[]; titles?: string[] }) => ({
  id: o.id,
  page_id: o.page,
  page_name: o.name,
  ad_delivery_start_time: o.start ?? "2026-10-03T07:00:00+0000",
  publisher_platforms: o.platforms ?? ["facebook", "instagram"],
  ad_creative_link_captions: o.captions ?? [],
  ad_creative_link_titles: o.titles ?? ["Devis gratuit en 24 h"],
})

const ad = (o: Partial<MetaAd> & { id: string; pageId: string; pageName: string }): MetaAd => ({ start: "2026-10-03", platforms: ["FACEBOOK"], domains: [], titles: [], ...o })

describe("Meta's Ad Library: the request", () => {
  it("asks for France's running ads of ten pages at most, with the token in the header and never in the address", async () => {
    const g = graph(() => ({ body: { data: [raw({ id: "1", page: "111", name: "Plomberie Roche" })] } }))
    const r = await searchAds({ pageIds: ["111", "222", ...Array.from({ length: 12 }, (_, i) => String(300 + i))] }, { token: TOKEN, fetchImpl: g.fetchImpl })
    expect(r.ads).toHaveLength(1)
    const u = new URL(g.calls[0].url)
    expect(u.origin + u.pathname).toBe("https://graph.facebook.com/v27.0/ads_archive")
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ ad_reached_countries: '["FR"]', ad_type: "ALL", ad_active_status: "ACTIVE", limit: "100" })
    expect(u.searchParams.get("search_page_ids")).toBe("[111,222,300,301,302,303,304,305,306,307]")
    // Meta's previews carry the token: they are never asked for.
    expect(u.searchParams.get("fields")).not.toContain("ad_snapshot_url")
    expect(g.calls[0].auth).toBe(`Bearer ${TOKEN}`)
    expect(g.calls.every((c) => !c.url.includes(TOKEN))).toBe(true)
  })

  it("searches a name as an exact phrase, one page of results; follows a batch's pages on Meta's host only, without a token", async () => {
    const name = graph(() => ({ body: { data: [], paging: { next: "https://graph.facebook.com/v27.0/ads_archive?after=x" } } }))
    const r = await searchAds({ terms: "Plomberie Roche" }, { token: TOKEN, fetchImpl: name.fetchImpl })
    expect(name.calls).toHaveLength(1)
    expect(r.more).toBe(true)
    expect(Object.fromEntries(new URL(name.calls[0].url).searchParams)).toMatchObject({ search_terms: "Plomberie Roche", search_type: "KEYWORD_EXACT_PHRASE" })

    let n = 0
    const pages = graph((u) => {
      n++
      if (n === 1) return { body: { data: [raw({ id: "1", page: "111", name: "A" })], paging: { next: `https://graph.facebook.com/v27.0/ads_archive?after=p2&access_token=${TOKEN}` } } }
      if (n === 2) return { body: { data: [raw({ id: "2", page: "111", name: "A" })], paging: { next: "https://evil.example/steal" } } }
      return { body: { data: [], url: u.toString() } }
    })
    const read = await searchAds({ pageIds: ["111"] }, { token: TOKEN, fetchImpl: pages.fetchImpl })
    expect(read.ads.map((a) => a.id)).toEqual(["1", "2"])
    expect(pages.calls).toHaveLength(2)
    expect(pages.calls[1].url).toBe("https://graph.facebook.com/v27.0/ads_archive?after=p2")
    expect(read.more).toBe(false)
  })

  it("reads an answer: dates, platforms, the domains the ads show, and skips an ad without a page", () => {
    const { ads } = parseAds({
      data: [
        raw({ id: "1", page: "111", name: "  Plomberie   Roche ", captions: ["PLOMBERIE-ROCHE.EXAMPLE", "www.roche.example/devis", "Réservez", "https://shop.example.com?x=1"], titles: ["  Devis   gratuit ", "Devis gratuit"] }),
        { id: "2", page_name: "Sans page" },
        { nonsense: true },
      ],
    })
    expect(ads).toEqual([
      { id: "1", pageId: "111", pageName: "Plomberie Roche", start: "2026-10-03", platforms: ["FACEBOOK", "INSTAGRAM"], domains: ["plomberie-roche.example", "roche.example", "shop.example.com"], titles: ["Devis gratuit"] },
    ])
    expect(domainOf("Appelez-nous")).toBeNull()
    expect(domainOf("fb.me/abc")).toBe("fb.me")
    expect(parseAds({ error: "x" })).toEqual({ ads: [], next: null })
  })

  it("tells a refused token, an unconfirmed identity and a rate limit apart, and never repeats the token", () => {
    expect(failureOf(400, { error: { code: 190, message: `Invalid OAuth access token ${TOKEN}` } }, TOKEN)).toMatchObject({ kind: "token", code: 190 })
    expect(failureOf(400, { error: { code: 190, message: `Invalid ${TOKEN}` } }, TOKEN).message).not.toContain(TOKEN)
    expect(failureOf(400, { error: { code: 10, message: "Application does not have permission for this action" } }, TOKEN).kind).toBe("identity")
    for (const code of [4, 17, 32, 613, 80_004]) expect(failureOf(400, { error: { code } }, TOKEN).kind).toBe("rate")
    expect(failureOf(429, null, TOKEN).kind).toBe("rate")
    expect(failureOf(400, { error: { code: 100, message: "Invalid parameter" } }, TOKEN).kind).toBe("unavailable")
    expect(failureOf(502, "<html>", TOKEN)).toMatchObject({ kind: "unavailable", message: expect.stringContaining("HTTP 502") })
  })

  it("refuses to call without a token, and turns a network failure into « unavailable » without the token", async () => {
    await expect(searchAds({ terms: "x" }, { token: "" })).rejects.toMatchObject({ kind: "token" })
    const down = (async () => {
      throw new TypeError(`fetch failed for ${TOKEN}`)
    }) as typeof fetch
    const error = await searchAds({ terms: "x" }, { token: TOKEN, fetchImpl: down }).then(
      () => null,
      (e: unknown) => e as Error
    )
    expect(error).toMatchObject({ kind: "unavailable" })
    expect(error?.message).not.toContain(TOKEN)
  })
})

describe("Meta's Ad Library: the token's check", () => {
  const debug = (data: unknown) => graph(() => ({ body: { data } })).fetchImpl
  const at = (days: number) => Math.round((now.getTime() + days * 86_400_000) / 1000)

  it("says how long the token lasts, and whether it is time to renew it", async () => {
    expect(await checkToken({ token: null }, now)).toEqual({ state: "missing", expiresAt: null, checkedAt: now.toISOString(), print: null })
    expect(await checkToken({ token: TOKEN, fetchImpl: debug({ is_valid: true, expires_at: at(50) }) }, now)).toMatchObject({ state: "ok", expiresAt: new Date(at(50) * 1000).toISOString(), print: tokenPrint(TOKEN) })
    expect(await checkToken({ token: TOKEN, fetchImpl: debug({ is_valid: true, expires_at: at(5) }) }, now)).toMatchObject({ state: "expiring" })
    expect(await checkToken({ token: TOKEN, fetchImpl: debug({ is_valid: true, expires_at: 0 }) }, now)).toMatchObject({ state: "ok", expiresAt: null })
    expect(await checkToken({ token: TOKEN, fetchImpl: debug({ is_valid: false, expires_at: at(-1) }) }, now)).toMatchObject({ state: "expired" })
    expect(await checkToken({ token: TOKEN, fetchImpl: debug({ is_valid: false, expires_at: at(20), error: { message: "Session has been invalidated" } }) }, now)).toMatchObject({ state: "invalid", message: "Session has been invalidated" })
    expect(await checkToken({ token: TOKEN, fetchImpl: graph(() => ({ status: 400, body: { error: { code: 190, message: "bad" } } })).fetchImpl }, now)).toMatchObject({ state: "invalid" })
    const down = (async () => {
      throw new TypeError("network")
    }) as typeof fetch
    expect(await checkToken({ token: TOKEN, fetchImpl: down }, now)).toMatchObject({ state: "unknown" })
    expect(tokenPrint(TOKEN)).toMatch(/^[0-9a-f]{8}$/)
    expect(tokenPrint(TOKEN)).not.toBe(tokenPrint(`${TOKEN}x`))
  })

  it("asks the owners to renew once per token and state, never while it works", () => {
    const base = { checkedAt: now.toISOString(), print: "abcd1234" }
    expect(tokenNotice({ ...base, state: "expiring", expiresAt: "2026-11-10T09:00:00.000Z" })).toMatchObject({ key: "expiring:2026-11-10:abcd1234", title: "Jeton Meta à renouveler avant le 10 novembre 2026" })
    expect(tokenNotice({ ...base, state: "expired", expiresAt: null })?.key).toBe("invalid:abcd1234")
    expect(tokenNotice({ ...base, state: "invalid", expiresAt: null })?.message).toContain("scripts/set-ai-worker-env.sh META_ADS_TOKEN")
    expect(tokenNotice({ ...base, state: "identity", expiresAt: null })).toMatchObject({ key: "identity:abcd1234", title: "Meta : identité à confirmer" })
    for (const state of ["ok", "unknown"] as const) expect(tokenNotice({ ...base, state, expiresAt: null })).toBeNull()
    expect(tokenNotice({ ...base, state: "missing", expiresAt: null, print: null })).toBeNull()
  })
})

describe("Meta's Ad Library: the company's page", () => {
  it("takes a page's number from a Facebook address that gives it, never from a vanity one", () => {
    expect(pageIdOf("https://www.facebook.com/profile.php?id=100063123456789")).toBe("100063123456789")
    expect(pageIdOf("https://facebook.com/pages/Plomberie-Roche/123456789012")).toBe("123456789012")
    expect(pageIdOf("https://www.facebook.com/people/Plomberie-Roche/100090000000001/")).toBe("100090000000001")
    expect(pageIdOf("https://www.facebook.com/Plomberie-Roche-100063123456789")).toBe("100063123456789")
    expect(pageIdOf("https://www.facebook.com/exemple.plomberie.roche")).toBeNull()
    expect(pageIdOf("https://www.instagram.com/profile.php?id=123456789")).toBeNull()
    expect(pageIdOf("pas une adresse")).toBeNull()
    expect(pageIdOf(null)).toBeNull()
  })

  it("ties a page by the domain its ads show first, else by the company's whole name, never by a homonym", () => {
    const company = { name: "SARL Plomberie Roche", domain: "www.plomberie-roche.example" }
    const ads = [
      ad({ id: "1", pageId: "1", pageName: "Plomberie Roche Villeurbanne" }),
      ad({ id: "2", pageId: "2", pageName: "Dépannage 69", domains: ["plomberie-roche.example"] }),
      ad({ id: "3", pageId: "3", pageName: "Plomberie Rocher" }),
    ]
    expect(matchPage(ads, company)).toMatchObject({ pageId: "2", how: "domain" })
    expect(matchPage(ads.slice(0, 1), company)).toMatchObject({ pageId: "1", how: "name", pageName: "Plomberie Roche Villeurbanne" })
    expect(matchPage(ads.slice(2), company)).toBeNull()
    // A subdomain of the site is the company's too; another site is not.
    expect(matchPage([ad({ id: "4", pageId: "4", pageName: "X", domains: ["shop.plomberie-roche.example"] })], company)?.how).toBe("domain")
    expect(matchPage([ad({ id: "5", pageId: "5", pageName: "X", domains: ["roche.example"] })], company)).toBeNull()
    // One word would match strangers: by its domain only.
    expect(matchPage([ad({ id: "6", pageId: "6", pageName: "Boulangerie" })], { name: "Boulangerie", domain: null })).toBeNull()
    // Among two pages of the name, the one with more ads.
    const two = [ad({ id: "7", pageId: "7", pageName: "Plomberie Roche" }), ad({ id: "8", pageId: "8", pageName: "Plomberie Roche" }), ad({ id: "9", pageId: "8", pageName: "Plomberie Roche" })]
    expect(matchPage(two, { name: "Plomberie Roche", domain: null })).toMatchObject({ pageId: "8", ads: [{ id: "8" }, { id: "9" }] })
  })

  it("keeps what the fiche shows, and says it in one sentence", () => {
    const ads = [
      ad({ id: "1", pageId: "1", pageName: "P", start: "2026-10-03", platforms: ["FACEBOOK", "INSTAGRAM"], domains: ["roche.example"], titles: ["Devis gratuit"] }),
      ad({ id: "2", pageId: "1", pageName: "P", start: "2026-09-12", platforms: ["FACEBOOK", "AUDIENCE_NETWORK"] }),
    ]
    const d = adsData({ pageId: "1", pageName: "P", how: "page", ads }, false, now)
    expect(d).toEqual({
      checkedAt: now.toISOString(),
      pageId: "1",
      pageName: "P",
      how: "page",
      active: 2,
      more: false,
      since: "2026-09-12",
      platforms: ["FACEBOOK", "INSTAGRAM", "AUDIENCE_NETWORK"],
      domains: ["roche.example"],
      ads: [
        { id: "1", start: "2026-10-03", platforms: ["FACEBOOK", "INSTAGRAM"], title: "Devis gratuit" },
        { id: "2", start: "2026-09-12", platforms: ["FACEBOOK", "AUDIENCE_NETWORK"], title: null },
      ],
    })
    expect(adsSummary(d)).toBe("2 publicités en cours sur Facebook, Instagram et Audience Network, la plus ancienne depuis le 12 septembre 2026.")
    expect(adsSummary(adsData({ pageId: "1", pageName: "P", how: "page", ads: ads.slice(0, 1) }, false, now))).toBe("1 publicité en cours sur Facebook et Instagram, depuis le 3 octobre 2026.")
    expect(adsSummary(adsData({ pageId: "1", pageName: "P", how: "page", ads }, true, now))).toMatch(/^Plus de 2 publicités en cours/)
    // A known page with no ad keeps its number; nothing found keeps nothing.
    expect(adsData({ pageId: "1", pageName: "P", how: "page", ads: [] }, true, now)).toMatchObject({ pageId: "1", active: 0, more: false, since: null })
    expect(adsData({ pageId: null, pageName: null, how: null, ads: [] }, false, now)).toMatchObject({ pageId: null, active: 0 })
  })

  it("is a signal of its own, and an offer signal of the landing and Meta Ads offers (catalogue 4)", () => {
    expect(SIGNAL_LABELS.ADS_RUNNING).toBe("Publicités Meta en cours")
    expect(isOfferSignal("ads_running")).toBe(true)
    expect(OFFER_SIGNALS.ads_running.group).toBe("ads")
    expect(OFFERS_V1.filter((o) => (o.signals as readonly string[]).includes("ads_running")).map((o) => o.slug)).toEqual(["landing-conversion", "meta-ads"])
    expect(CATALOG_VERSION).toBe(4)
    expect(META_ADS_SOURCE).toBe("Bibliothèque publicitaire Meta")
  })
})
