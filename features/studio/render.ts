import type { AxeSummary } from "./schemas"

/**
 * What the Studio asks of a browser (E23): prepare the site's images, render a page on a computer and a phone, run
 * axe-core on it. The worker gives a Chromium implementation (worker/browser.ts, Playwright); tests give a fake. The
 * browser reaches nothing outside the page: every request it makes is answered from memory or refused.
 */
export interface RawImage {
  name: string
  kind: "logo" | "image"
  data: Uint8Array
  mediaType: string
}

export interface PreparedImage {
  name: string
  /** WebP, at most 1 600 px wide (600 for a logo). */
  data: Uint8Array
  mediaType: string
  width: number
  height: number
  /** The main colours of a logo, most present first. */
  colors: string[]
}

export interface PageAsset {
  data: Uint8Array
  mediaType: string
}

export interface Tile {
  data: Uint8Array
  mediaType: "image/jpeg"
  label: string
}

export interface RenderedPage {
  /** JPEG of the whole page, on a computer (1440 px) and on a phone (390 px). */
  desktop: Uint8Array
  mobile: Uint8Array
  /** The first screen on a computer. */
  thumb: Uint8Array
  /** Screens for the critique, computer then phone, in page order. */
  tiles: Tile[]
  axe: AxeSummary | null
  heights: { desktop: number; mobile: number }
}

export interface RenderSession {
  prepareImages(images: readonly RawImage[]): Promise<PreparedImage[]>
  /** `html` references its assets as cleads-asset:<name>. */
  render(html: string, assets: ReadonlyMap<string, PageAsset>): Promise<RenderedPage>
  close(): Promise<void>
}

export type Renderer = () => Promise<RenderSession>
