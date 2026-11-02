import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import type { Browser, BrowserContext, Page, Route } from "playwright-core"
import { withAssets } from "@/features/studio/document"
import type { PageAsset, PreparedImage, RawImage, RenderedPage, Renderer, RenderSession, Tile } from "@/features/studio/render"
import type { AxeSummary, AxeViolation } from "@/features/studio/schemas"

/**
 * The Studio's browser in the worker (E23): Chromium through Playwright, headless, cut off from the network. The page
 * and its images are served from memory under a reserved address (.invalid never resolves); any other request is
 * refused, so a page can neither call out nor reach the server's own network. One browser per run, closed after it.
 */
const ORIGIN = "https://maquette.cleads.invalid"
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }
const MAX_HEIGHT = 8_000
const TILES = { desktop: { count: 4, height: 1_200 }, mobile: { count: 3, height: MOBILE.height } }
const JPEG = { type: "jpeg" as const, quality: 72 }
const RENDER_TIMEOUT_MS = 90_000

let axeSource: Promise<string> | null = null
/** axe-core's script, read from the image's node_modules (it is not bundled). */
const axeScript = () => (axeSource ??= readFile(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8"))

async function withTimeout<T>(work: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`${what} : délai dépassé`)), RENDER_TIMEOUT_MS)))])
  } finally {
    clearTimeout(timer)
  }
}

/** Runs in the page: decode an image, resize it, re-encode it as WebP, and read a logo's main colours. */
async function prepareInPage(arg: { b64: string; type: string; max: number; logo: boolean }) {
  const bytes = Uint8Array.from(atob(arg.b64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: arg.type }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const svg = arg.type.includes("svg")
    let w = img.naturalWidth
    let h = img.naturalHeight
    if (svg && (!w || !h)) [w, h] = [arg.max, Math.round(arg.max / 3)]
    if (!w || !h || (!arg.logo && (w < 240 || h < 160))) return null
    const scale = Math.min(1, arg.max / w)
    const cw = Math.max(1, Math.round(w * scale))
    const ch = Math.max(1, Math.round(h * scale))
    const canvas = new OffscreenCanvas(cw, ch)
    const g = canvas.getContext("2d")!
    g.drawImage(img, 0, 0, cw, ch)
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: arg.logo ? 0.92 : 0.8 })
    const out = new Uint8Array(await blob.arrayBuffer())
    let bin = ""
    for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode(...out.subarray(i, i + 0x8000))
    const colors: string[] = []
    if (arg.logo) {
      const small = new OffscreenCanvas(48, 48)
      const sg = small.getContext("2d")!
      sg.drawImage(img, 0, 0, 48, 48)
      const px = sg.getImageData(0, 0, 48, 48).data
      // Pixels grouped by close colour; each group gives its average, so the brand colour comes out exact.
      const groups = new Map<number, [number, number, number, number]>()
      for (let i = 0; i < px.length; i += 4) {
        const [r, gg, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]]
        if (a < 200 || Math.max(r, gg, b) - Math.min(r, gg, b) < 30) continue
        const key = ((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4)
        const g = groups.get(key) ?? [0, 0, 0, 0]
        groups.set(key, [g[0] + r, g[1] + gg, g[2] + b, g[3] + 1])
      }
      const total = [...groups.values()].reduce((s, g) => s + g[3], 0)
      for (const [r, gg, b, n] of [...groups.values()].sort((a, b) => b[3] - a[3]).slice(0, 3)) {
        if (n / Math.max(total, 1) < 0.08) break
        colors.push(`#${[r, gg, b].map((v) => Math.round(v / n).toString(16).padStart(2, "0")).join("")}`)
      }
    }
    return { data: btoa(bin), width: cw, height: ch, colors }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Runs in the page: axe-core on WCAG 2.1 A and AA. */
async function axeInPage() {
  const axe = (window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<{ violations: { id: string; impact: string | null; help: string; nodes: { html: string }[] }[] }> } }).axe
  const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] })
  return r.violations.map((v) => ({ id: v.id, impact: v.impact ?? "minor", help: v.help, nodes: v.nodes.length, sample: (v.nodes[0]?.html ?? "").slice(0, 160) }))
}

function summarise(lists: Awaited<ReturnType<typeof axeInPage>>[]): AxeSummary {
  const byId = new Map<string, AxeViolation>()
  for (const v of lists.flat()) {
    const impact = (["critical", "serious", "moderate", "minor"].includes(v.impact) ? v.impact : "minor") as AxeViolation["impact"]
    const prev = byId.get(v.id)
    if (!prev || v.nodes > prev.nodes) byId.set(v.id, { id: v.id, impact, help: v.help, nodes: v.nodes, sample: v.sample })
  }
  const violations = [...byId.values()].sort((a, b) => ["critical", "serious", "moderate", "minor"].indexOf(a.impact) - ["critical", "serious", "moderate", "minor"].indexOf(b.impact))
  const count = (i: AxeViolation["impact"]) => violations.filter((v) => v.impact === i).length
  return { critical: count("critical"), serious: count("serious"), moderate: count("moderate"), minor: count("minor"), violations: violations.slice(0, 12) }
}

/**
 * Serves the page and its assets from memory; everything else is refused. The captures show the whole page at once, so
 * every image loads at once: a lazy image below the first screen would stay blank in a full-page capture (seen on the
 * first real mock-up), while a visitor sees it as they scroll.
 */
function router(html: string, assets: ReadonlyMap<string, PageAsset>) {
  const doc = withAssets(html, (name) => `${ORIGIN}/a/${name}`).replace(/ (loading="lazy"|decoding="async")/g, "")
  return (route: Route) => {
    const url = route.request().url()
    if (url === `${ORIGIN}/`) return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: doc })
    if (url.startsWith(`${ORIGIN}/a/`)) {
      const asset = assets.get(decodeURIComponent(url.slice(ORIGIN.length + 3)))
      return asset ? route.fulfill({ status: 200, contentType: asset.mediaType, body: Buffer.from(asset.data) }) : route.fulfill({ status: 404, body: "" })
    }
    return route.abort("blockedbyclient")
  }
}

/** Every image loaded (lazy ones too) and every font ready, so the captures show the page as a visitor sees it. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    for (const img of Array.from(document.images)) img.loading = "eager"
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete
          ? null
          : new Promise((done) => {
              img.addEventListener("load", done, { once: true })
              img.addEventListener("error", done, { once: true })
            })
      )
    )
    // Decoded before the capture, or an image outside the viewport may still be painted blank.
    await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined)))
    await document.fonts.ready
  })
}

async function open(browser: Browser, html: string, assets: ReadonlyMap<string, PageAsset>, mobile: boolean): Promise<{ context: BrowserContext; page: Page; height: number }> {
  const context = await browser.newContext({
    viewport: mobile ? MOBILE : DESKTOP,
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: "fr-FR",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    javaScriptEnabled: true,
  })
  await context.route("**/*", router(html, assets))
  const page = await context.newPage()
  await page.goto(`${ORIGIN}/`, { waitUntil: "load", timeout: 30_000 })
  await settle(page)
  const height = Math.max(await page.evaluate(() => document.documentElement.scrollHeight), mobile ? MOBILE.height : DESKTOP.height)
  return { context, page, height }
}

async function tiles(page: Page, height: number, width: number, spec: { count: number; height: number }, label: string): Promise<Tile[]> {
  const out: Tile[] = []
  for (let i = 0; i < spec.count && i * spec.height < Math.min(height, MAX_HEIGHT); i++) {
    const clip = { x: 0, y: i * spec.height, width, height: Math.min(spec.height, height - i * spec.height) }
    out.push({ data: await page.screenshot({ ...JPEG, fullPage: true, clip }), mediaType: "image/jpeg", label: `${label} ${i + 1}` })
  }
  return out
}

function session(browser: Browser): RenderSession {
  return {
    async prepareImages(images: readonly RawImage[]): Promise<PreparedImage[]> {
      const context = await browser.newContext({ javaScriptEnabled: true, serviceWorkers: "block" })
      await context.route("**/*", (route) => route.abort("blockedbyclient"))
      try {
        const page = await context.newPage()
        await page.setContent("<!doctype html><title>images</title>")
        const out: PreparedImage[] = []
        for (const img of images) {
          try {
            const r = await page.evaluate(prepareInPage, { b64: Buffer.from(img.data).toString("base64"), type: img.mediaType, max: img.kind === "logo" ? 600 : 1_600, logo: img.kind === "logo" })
            if (r) out.push({ name: img.name, data: new Uint8Array(Buffer.from(r.data, "base64")), mediaType: "image/webp", width: r.width, height: r.height, colors: r.colors })
          } catch {
            // An image the browser cannot decode is left out.
          }
        }
        return out
      } finally {
        await context.close()
      }
    },

    render(html: string, assets: ReadonlyMap<string, PageAsset>): Promise<RenderedPage> {
      return withTimeout(
        (async () => {
          const axe = await axeScript().catch(() => null)
          const desktop = await open(browser, html, assets, false)
          try {
            const mobile = await open(browser, html, assets, true)
            try {
              const clip = (h: number, w: number) => (h > MAX_HEIGHT ? { x: 0, y: 0, width: w, height: MAX_HEIGHT } : undefined)
              const shots = {
                desktop: await desktop.page.screenshot({ ...JPEG, fullPage: true, clip: clip(desktop.height, DESKTOP.width) }),
                thumb: await desktop.page.screenshot({ ...JPEG }),
                mobile: await mobile.page.screenshot({ ...JPEG, fullPage: true, scale: "css", clip: clip(mobile.height, MOBILE.width) }),
              }
              const all = [...(await tiles(desktop.page, desktop.height, DESKTOP.width, TILES.desktop, "ordinateur")), ...(await tiles(mobile.page, mobile.height, MOBILE.width, TILES.mobile, "téléphone"))]
              let summary: AxeSummary | null = null
              if (axe) {
                const lists = []
                for (const page of [desktop.page, mobile.page]) {
                  await page.addScriptTag({ content: axe })
                  lists.push(await page.evaluate(axeInPage))
                }
                summary = summarise(lists)
              }
              return { desktop: shots.desktop, mobile: shots.mobile, thumb: shots.thumb, tiles: all, axe: summary, heights: { desktop: desktop.height, mobile: mobile.height } }
            } finally {
              await mobile.context.close()
            }
          } finally {
            await desktop.context.close()
          }
        })(),
        "Rendu de la maquette"
      )
    },

    async close() {
      await browser.close().catch(() => undefined)
    },
  }
}

/**
 * Chromium's headless shell installed in the image (worker/Dockerfile); STUDIO_CHROMIUM_PATH points to another build,
 * a local Chrome for instance. Playwright starts it without its sandbox (the container has no user namespaces): what
 * it renders is our own sanitised page, cut off from the network.
 */
export function browserRenderer(opts: { executablePath?: string } = {}): Renderer {
  return async () => {
    const { chromium } = await import("playwright-core")
    const browser = await chromium.launch({
      headless: true,
      executablePath: opts.executablePath ?? (process.env.STUDIO_CHROMIUM_PATH || undefined),
      args: ["--disable-dev-shm-usage", "--disable-gpu", "--hide-scrollbars", "--mute-audio", "--font-render-hinting=none", "--disable-background-networking"],
    })
    return session(browser)
  }
}
