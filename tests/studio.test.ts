import { describe, expect, it } from "vitest"
import { assembleDocument, staticChecks, withAssets, VISIT_MARKER } from "@/features/studio/document"
import { cssFamilies, fontFaceCss, googleFamilies, latinFaces } from "@/features/studio/fonts"
import { brandColors, contrast, cssColors, parseColor, readableOn, scale, textSafe, toHex, WHITE } from "@/features/studio/palette"
import { extractBody, safeHref, sanitizeBody } from "@/features/studio/sanitize"
import { compileCss } from "@/features/studio/tailwind"

const ASSETS = new Map([
  ["logo", { width: 240, height: 80, kind: "logo" }],
  ["image-1", { width: 1600, height: 900, kind: "image" }],
  ["image-2", { width: 800, height: 600, kind: "image" }],
])
const clean = (html: string) => sanitizeBody(html, { assets: ASSETS })

describe("sanitizer (E23)", () => {
  it("removes scripts, handlers, frames, forms and styles, whatever their spelling", () => {
    const { html, report } = clean(`
      <section class="p-4" onclick="alert(1)" style="color:red"><h1 onmouseover="x()">Titre</h1>
      <SCRIPT>alert(1)</SCRIPT><script src="https://evil.example/x.js"></script>
      <iframe src="https://evil.example"></iframe><object data="x"></object><embed src="x">
      <form action="https://evil.example"><input name="q"><button>Envoyer</button></form>
      <style>body{background:url(https://evil.example/t.png)}</style><template><img src=x onerror=alert(1)></template>
      <noscript><p>no</p></noscript><math><mi>x</mi></math><meta http-equiv="refresh" content="0;url=https://evil.example"></section>`)
    expect(html).not.toMatch(/script|onclick|onmouseover|onerror|iframe|object|embed|<form|<input|<style|template|noscript|math|refresh|evil\.example|style=/i)
    expect(html).toContain('<h1>Titre</h1>')
    expect(report.removed["<script>"]).toBe(2)
    expect(report.removed["gestionnaire d’événement"]).toBe(2)
  })

  it("keeps the content of unknown wrappers but not the wrappers", () => {
    const { html } = clean(`<center><font color="red">Bonjour</font></center><button class="x">Appeler</button>`)
    expect(html).toBe("BonjourAppeler")
  })

  it("only lets https, tel, mailto and the page's anchors through, whatever the encoding", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull()
    expect(safeHref("java\tscript:alert(1)")).toBeNull()
    expect(safeHref(" JaVaScRiPt:alert(1)")).toBeNull()
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeNull()
    expect(safeHref("http://example.fr")).toBeNull()
    expect(safeHref("https://user:pw@example.fr")).toBeNull()
    expect(safeHref("/contact")).toBeNull()
    expect(safeHref("tel:02 41 00 11 22")).toEqual({ href: "tel:0241001122", kind: "tel" })
    expect(safeHref("tel:<script>")).toBeNull()
    expect(safeHref("tel:+33241001122")).toEqual({ href: "tel:+33241001122", kind: "tel" })
    expect(safeHref("tel:02.41.00.11.22")).toEqual({ href: "tel:0241001122", kind: "tel" })
    expect(safeHref("mailto:contact@plomberie.fr?subject=Devis")).toMatchObject({ kind: "mailto" })
    expect(safeHref("#contact")).toEqual({ href: "#contact", kind: "anchors" })
    expect(safeHref("https://www.doctolib.fr/dentiste/angers")).toMatchObject({ kind: "https" })
    const { html, report } = clean(`<a href="javascript&#58;alert(1)">x</a><a href="&#x6A;avascript:alert(1)">y</a><a href="https://ok.fr" target="_blank">z</a><a href="tel:+33241001122">t</a>`)
    expect(html).not.toMatch(/javascript/i)
    expect(html).toContain('<a href="https://ok.fr/" target="_blank" rel="noopener noreferrer">z</a>')
    expect(report.links).toEqual({ tel: 1, mailto: 0, https: 1, anchors: 0 })
  })

  it("keeps only the site's own images, with their real size, the first one loaded first", () => {
    const { html, report } = clean(`
      <img src="asset:logo" alt="Logo Martin"><img src="asset:image-1" alt="Chantier"><img src="asset:image-2">
      <img src="https://tracker.example/p.gif" alt=""><img src="asset:inconnue" alt="x"><img src="data:image/svg+xml,<svg onload=alert(1)>">`)
    expect(report.images).toEqual(["logo", "image-1", "image-2"])
    expect(html).toContain('<img src="cleads-asset:logo" alt="Logo Martin" width="240" height="80" decoding="async">')
    expect(html).toContain('<img src="cleads-asset:image-1" alt="Chantier" width="1600" height="900" fetchpriority="high" decoding="async">')
    expect(html).toContain('<img src="cleads-asset:image-2" alt="" width="800" height="600" loading="lazy" decoding="async">')
    expect(html).not.toMatch(/tracker|inconnue|svg\+xml/)
    expect(report.removed["image extérieure"]).toBe(3)
  })

  it("keeps simple inline icons and nothing that runs or loads inside them", () => {
    const { html } = clean(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" onload="alert(1)"><path d="M3 12h18"/><use href="https://evil.example/s.svg#x"/><foreignObject><p>x</p></foreignObject><a href="javascript:alert(1)"><circle cx="12" cy="12" r="3"/></a><circle cx="1" cy="1" r="1" fill="url(https://evil.example/x)"/></svg>`)
    expect(html).toContain("<svg")
    expect(html).toMatch(/viewBox="0 0 24 24"/)
    expect(html).toContain('<path d="M3 12h18"/>')
    expect(html).not.toMatch(/onload|use|foreignObject|javascript|evil/i)
  })

  it("takes the body out of a whole document and drops duplicate ids", () => {
    const answer = "Voici la page :\n```html\n<!doctype html><html><head><title>x</title><script>1</script></head><body><main id=\"a\"><p id=\"a\">Un</p></main></body></html>\n```"
    expect(extractBody(answer)).toMatch(/^<!doctype html>/)
    const { html } = clean(extractBody(answer))
    expect(html).toBe('<main id="a"><p>Un</p></main>')
  })

  it("escapes text again, so nothing inside it becomes markup", () => {
    const { html } = clean(`<p>&lt;script&gt;alert(1)&lt;/script&gt; «&nbsp;Devis gratuit&nbsp;»</p>`)
    expect(html).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt; «&nbsp;Devis gratuit&nbsp;»</p>")
  })
})

describe("palette (E23)", () => {
  it("reads hex, rgb and hsl, and leaves out transparent colours", () => {
    expect(parseColor("#0a7")).toEqual([0, 170, 119])
    expect(parseColor("rgb(10 20 30)")).toEqual([10, 20, 30])
    expect(parseColor("rgba(10, 20, 30, .5)")).toBeNull()
    expect(parseColor("#00000033")).toBeNull()
    expect(toHex(parseColor("hsl(210, 100%, 40%)")!)).toBe("#0066cc")
    expect(parseColor("var(--x)")).toBeNull()
  })

  it("measures contrast and finds text colours that read", () => {
    expect(contrast([0, 0, 0], WHITE)).toBeCloseTo(21, 0)
    expect(readableOn([250, 204, 21])).not.toEqual(WHITE)
    expect(readableOn([30, 64, 175])).toEqual(WHITE)
    expect(contrast(textSafe([250, 204, 21]), WHITE)).toBeGreaterThanOrEqual(4.5)
    expect(scale([0, 128, 255])["500"]).toBe("#0080ff")
  })

  it("ranks a site's brand colours and leaves greys out", () => {
    const found = cssColors(":root{--primary-color:#e30613}.btn{background:#e30613;color:#fff}a{color:#e3061a}body{color:#333;background:url(x.png) #fafafa}.x{border:1px solid #1d4ed8}")
    const brand = brandColors(found)
    expect(brand[0].hex).toBe("#e30613")
    expect(brand.map((b) => b.hex)).toContain("#1d4ed8")
    expect(brand.some((b) => b.hex === "#333333" || b.hex === "#fafafa")).toBe(false)
  })
})

describe("fonts (E23)", () => {
  it("finds the families a site uses", () => {
    expect(cssFamilies("body{font-family:'Montserrat',sans-serif}h1{font-family:Montserrat}p{font-family:Arial}code{font-family:var(--mono)}")).toEqual(["Montserrat"])
    expect(googleFamilies("https://fonts.googleapis.com/css?family=Open+Sans:400,700|Lato")).toEqual(["Open Sans", "Lato"])
    expect(googleFamilies("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter&display=swap")).toEqual(["Playfair Display", "Inter"])
    expect(googleFamilies("https://evil.example/css?family=Inter")).toEqual([])
  })

  it("keeps the latin faces of a Google Fonts stylesheet and writes them for our host", () => {
    const css = `/* cyrillic */\n@font-face {\n  font-family: 'Inter';\n  font-style: normal;\n  font-weight: 400;\n  src: url(https://fonts.gstatic.com/s/inter/v20/cyr.woff2) format('woff2');\n}\n/* latin */\n@font-face {\n  font-family: 'Inter';\n  font-style: normal;\n  font-weight: 400;\n  src: url(https://fonts.gstatic.com/s/inter/v20/latin.woff2) format('woff2');\n}\n/* latin */\n@font-face {\n  font-family: 'Inter';\n  font-style: normal;\n  font-weight: 700;\n  src: url(https://fonts.gstatic.com/s/inter/v20/latin.woff2) format('woff2');\n}`
    const faces = latinFaces(css)
    expect(faces.map((f) => f.weight)).toEqual(["400", "700"])
    expect(new Set(faces.map((f) => f.url)).size).toBe(1)
    expect(fontFaceCss([{ family: "Inter", weights: ["400", "700"], asset: "font-inter-1" }])).toContain('src:url(cleads-asset:font-inter-1) format("woff2")')
  })
})

describe("page CSS and document (E23)", () => {
  it("compiles only the classes used, with the brand theme, and nothing that loads a resource", async () => {
    const body = `<section class="bg-brand text-brand-ink md:flex font-display bg-[url(https://evil.example/x.png)] hover:bg-brand-700"><p class="text-accent-text">x</p></section>`
    const { css, removed } = await compileCss(body, { primary: "#e30613", accent: "#1d4ed8", heading: "Fraunces", body: "Inter" })
    expect(css).toContain(".bg-brand{")
    expect(css).toContain("@media (min-width:768px)")
    expect(css).toContain('"Fraunces"')
    expect(css).not.toMatch(/url\(|evil/)
    expect(removed).toBe(1)
    expect(css).not.toMatch(/\n\s+/)
  })

  it("wraps the body with the CRM's head, banner and visit marker, and rewrites assets where it is served", () => {
    const doc = assembleDocument({ company: "Plomberie <Martin>", description: "Dépannage", body: '<main><img src="cleads-asset:logo" alt=""></main>', css: ".x{}", fontCss: "", ink: "#0f172a", fontFamily: '"Inter", sans-serif' })
    expect(doc).toMatch(/^<!doctype html><html lang="fr">/)
    expect(doc).toContain("Maquette non contractuelle réalisée par <strong>Cleads</strong> pour Plomberie &lt;Martin&gt;")
    expect(doc).toContain(VISIT_MARKER)
    expect(withAssets(doc, (n) => `/tok/a/${n}`)).toContain('src="/tok/a/logo"')
    expect(withAssets(doc, () => null)).toContain('src="data:,"')
  })

  it("checks the markup for headings, alternatives, contact links and placeholders", () => {
    const checks = staticChecks('<h1>A</h1><h1>B</h1><img src="cleads-asset:logo" alt=""><img src="cleads-asset:image-1" alt=""><a href="tel:+33241001122">x</a><p>Lorem ipsum {{prenom}} 01 00 00 00 00</p>', "logo")
    expect(checks).toMatchObject({ h1: 2, emptyAlt: 1, phoneLink: true, emailLink: false })
    expect(checks.placeholders.length).toBe(3)
  })
})

describe("preview host and links (E23)", () => {
  it("serves previews on their host only, the CRM's host never", async () => {
    const { onPreviewHost, previewHost } = await import("@/features/studio/host")
    process.env.STUDIO_PREVIEW_HOST = "apercu.cleads.test"
    try {
      expect(previewHost()).toBe("apercu.cleads.test")
      expect(onPreviewHost("APERCU.cleads.test")).toBe(true)
      expect(onPreviewHost("cleads.test")).toBe(false)
      expect(onPreviewHost("apercu.cleads.test.evil.example")).toBe(false)
      expect(onPreviewHost(null)).toBe(false)
      const { GET } = await import("@/app/apercu/[...path]/route")
      const call = (host: string, path: string[]) => GET(new Request(`https://${host}/x`, { headers: { host } }), { params: Promise.resolve({ path }) })
      expect((await call("cleads.test", ["robots.txt"])).status).toBe(404)
      expect(await (await call("apercu.cleads.test", ["robots.txt"])).text()).toContain("Disallow: /")
      // Rewritten by Netlify, then by Next: the extra prefix is dropped.
      expect(await (await call("apercu.cleads.test", ["apercu", "robots.txt"])).text()).toContain("Disallow: /")
      expect((await call("apercu.cleads.test", ["apercu"])).status).toBe(404)
    } finally {
      delete process.env.STUDIO_PREVIEW_HOST
    }
  })

  it("derives a link from its nonce, shows it again, and stores only its hash", async () => {
    process.env.NEXTAUTH_SECRET = "unit-test-secret-long-enough-for-hkdf"
    process.env.NEXT_PUBLIC_APP_URL = "https://cleads.test"
    const { hashToken, newNonce, previewUrl, shareToken, tokenMatches, TOKEN } = await import("@/features/studio/link")
    const nonce = newNonce()
    const token = shareToken("site-1", nonce)
    expect(token).toMatch(TOKEN)
    expect(shareToken("site-1", nonce)).toBe(token)
    expect(shareToken("site-1", newNonce())).not.toBe(token)
    expect(shareToken("site-2", nonce)).not.toBe(token)
    expect(tokenMatches(token, hashToken(token))).toBe(true)
    expect(hashToken(token)).not.toContain(token)
    expect(previewUrl(token, "apercu.cleads.fr")).toBe(`https://apercu.cleads.fr/${token}`)
    expect(previewUrl(token, "apercu.localhost:3100")).toBe(`http://apercu.localhost:3100/${token}`)
    expect(previewUrl(token, null)).toBe(`https://cleads.test/apercu/${token}`)
  })

  it("isolates every preview: sandbox without scripts, nothing loaded from elsewhere, framed by the CRM only", async () => {
    const { previewHeaders } = await import("@/features/studio/preview")
    const csp = previewHeaders("https://cleads.fr")["Content-Security-Policy"]
    expect(csp).toMatch(/^sandbox allow-popups allow-popups-to-escape-sandbox allow-top-navigation-to-custom-protocols;/)
    expect(csp).not.toMatch(/allow-scripts|allow-same-origin|allow-forms/)
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("frame-ancestors https://cleads.fr")
    expect(previewHeaders()["Referrer-Policy"]).toBe("no-referrer")
  })
})
