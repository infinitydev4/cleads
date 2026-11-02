/**
 * Colours for the Studio Web (E23): the ones a prospect's site and logo use, read from any CSS notation, and what a page
 * needs from a brand colour (a scale of tints and shades, a readable text colour), with contrast measured the WCAG way.
 */
export type Rgb = [number, number, number]

export const WHITE: Rgb = [255, 255, 255]
export const INK: Rgb = [15, 23, 42]

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)))

function channel(raw: string, max = 255): number | null {
  const v = raw.trim()
  if (v.endsWith("%")) {
    const n = Number(v.slice(0, -1))
    return Number.isFinite(n) ? clamp255((n / 100) * 255) : null
  }
  const n = Number(v)
  return Number.isFinite(n) ? clamp255((n / max) * 255) : null
}

function alpha(raw: string | undefined): number {
  if (raw == null) return 1
  const v = raw.trim()
  const n = v.endsWith("%") ? Number(v.slice(0, -1)) / 100 : Number(v)
  return Number.isFinite(n) ? n : 1
}

function fromHsl(h: number, s: number, l: number): Rgb {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [clamp255(f(0) * 255), clamp255(f(8) * 255), clamp255(f(4) * 255)]
}

/** A solid colour in hex, rgb() or hsl(); null for anything else or anything clearly transparent. */
export function parseColor(raw: string): Rgb | null {
  const text = raw.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)
  if (hex) {
    let h = hex[1]
    if (h.length <= 4) h = [...h].map((c) => c + c).join("")
    if (h.length === 8 && parseInt(h.slice(6), 16) < 230) return null
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(text)
  if (!fn) return null
  const parts = fn[2].split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3 || alpha(parts[3]) < 0.9) return null
  if (fn[1].startsWith("rgb")) {
    const [r, g, b] = parts.slice(0, 3).map((p) => channel(p))
    return r == null || g == null || b == null ? null : [r, g, b]
  }
  const h = Number(parts[0].replace(/deg$/, ""))
  const s = Number(parts[1].replace(/%$/, "")) / 100
  const l = Number(parts[2].replace(/%$/, "")) / 100
  return [h, s, l].every(Number.isFinite) ? fromHsl(((h % 360) + 360) % 360, Math.min(Math.max(s, 0), 1), Math.min(Math.max(l, 0), 1)) : null
}

export const toHex = (c: Rgb) => `#${c.map((v) => clamp255(v).toString(16).padStart(2, "0")).join("")}`

/** Relative luminance (WCAG 2.x). */
export function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** Contrast ratio, 1 to 21. Body text needs 4.5, large text 3. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** How colourful, 0 (grey) to 1. */
export const chroma = (c: Rgb) => (Math.max(...c) - Math.min(...c)) / 255
export const isNeutral = (c: Rgb) => chroma(c) < 0.1

export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(clamp255) as Rgb

const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** White or dark ink, whichever reads better on this background. */
export const readableOn = (bg: Rgb): Rgb => (contrast(bg, WHITE) >= contrast(bg, INK) ? WHITE : INK)

/** The colour darkened (or lightened, on a dark background) until text in it reaches `min` on `bg`. */
export function textSafe(color: Rgb, bg: Rgb = WHITE, min = 4.5): Rgb {
  const toward: Rgb = luminance(bg) > 0.5 ? [0, 0, 0] : [255, 255, 255]
  for (let t = 0; t <= 1; t += 0.05) {
    const c = mix(color, toward, t)
    if (contrast(c, bg) >= min) return c
  }
  return toward
}

export const SCALE_STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const

/** Tints and shades around a brand colour, the 500 step being the colour itself (Tailwind's naming). */
export function scale(base: Rgb): Record<(typeof SCALE_STEPS)[number], string> {
  const tints = [0.95, 0.9, 0.75, 0.55, 0.3]
  const shades = [0.15, 0.3, 0.45, 0.6, 0.72]
  const out = {} as Record<(typeof SCALE_STEPS)[number], string>
  SCALE_STEPS.forEach((step, i) => {
    out[step] = toHex(i < 5 ? mix(base, WHITE, tints[i]) : i === 5 ? base : mix(base, [0, 0, 0], shades[i - 6]))
  })
  return out
}

export interface FoundColor {
  hex: string
  weight: number
  source: "css" | "theme" | "logo"
}

const COLOR_TOKEN = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?)\([^()]*\)/gi
const BRAND_VARIABLE = /--[\w-]*(primary|brand|accent|main|theme|secondary|couleur|color-1)[\w-]*\s*:\s*([^;}{]+)/gi
const COLOR_PROPERTY = /(?:^|[;{\s])(color|background(?:-color)?|border(?:-[a-z]+)?-color|border|fill|stroke|outline-color)\s*:\s*([^;}{]+)/gi

/**
 * The colours a stylesheet uses, by weight: a brand variable (--primary, --brand…) counts most, a background or a
 * border more than a text colour. Greys are kept apart by the caller; urls are never read.
 */
export function cssColors(css: string): FoundColor[] {
  const weights = new Map<string, number>()
  const add = (value: string, w: number) => {
    for (const token of value.replace(/url\([^)]*\)/gi, "").match(COLOR_TOKEN) ?? []) {
      const c = parseColor(token)
      if (c) weights.set(toHex(c), (weights.get(toHex(c)) ?? 0) + w)
    }
  }
  const text = css.slice(0, 600_000)
  for (const m of text.matchAll(BRAND_VARIABLE)) add(m[2], 8)
  for (const m of text.matchAll(COLOR_PROPERTY)) add(m[2], m[1] === "color" ? 1 : 2)
  return [...weights].map(([hex, weight]) => ({ hex, weight, source: "css" as const })).sort((a, b) => b.weight - a.weight)
}

/** The distinct brand-looking colours, strongest first: similar shades merged, greys left out. */
export function brandColors(found: readonly FoundColor[], max = 6): FoundColor[] {
  const out: FoundColor[] = []
  for (const f of [...found].sort((a, b) => b.weight - a.weight)) {
    const c = parseColor(f.hex)
    if (!c || isNeutral(c)) continue
    const near = out.find((o) => distance(parseColor(o.hex)!, c) < 40)
    if (near) near.weight += f.weight
    else out.push({ ...f })
    if (out.length >= max * 2) break
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, max)
}
