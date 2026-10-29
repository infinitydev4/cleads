import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const tokens = JSON.parse(readFileSync("styles/tokens.json", "utf8")) as {
  light: Record<string, string>
  dark: Record<string, string>
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Text pairs need 4.5:1 (WCAG AA); borders of inputs and focus rings need 3:1 (non-text contrast).
const textPairs: [string, string][] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "background"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "card"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["success", "background"],
  ["success", "success-subtle"],
  ["warning", "background"],
  ["warning", "warning-subtle"],
  ["info", "background"],
  ["info", "info-subtle"],
  ["destructive-text", "destructive-subtle"],
  ["destructive-text", "background"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-muted", "sidebar"],
  ["sidebar-foreground", "sidebar-accent"],
]
const uiPairs: [string, string][] = [
  ["input", "background"],
  ["input", "card"],
  ["ring", "background"],
  ["ring", "card"],
]

describe.each(["light", "dark"] as const)("%s palette", (mode) => {
  const p = tokens[mode]
  it.each(textPairs)("%s on %s reaches 4.5:1", (fg, bg) => {
    expect(contrast(p[fg], p[bg]), `${fg} ${p[fg]} on ${bg} ${p[bg]}`).toBeGreaterThanOrEqual(4.5)
  })
  it.each(uiPairs)("%s against %s reaches 3:1", (fg, bg) => {
    expect(contrast(p[fg], p[bg]), `${fg} ${p[fg]} against ${bg} ${p[bg]}`).toBeGreaterThanOrEqual(3)
  })
})

describe("generated css", () => {
  it("is in sync with tokens.json (run `npm run tokens`)", async () => {
    const { hexToHsl } = await import("../scripts/hsl.mjs")
    const css = readFileSync("styles/tokens.css", "utf8")
    for (const [name, hex] of Object.entries(tokens.light)) {
      expect(css).toContain(`--${name}: ${hexToHsl(hex)};`)
    }
  })
})
