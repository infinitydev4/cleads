import postcss, { type Root } from "postcss"
import tailwindcss from "tailwindcss"
import { fontStack } from "./fonts"
import { parseColor, readableOn, scale, textSafe, toHex, WHITE, type Rgb } from "./palette"

/**
 * The page's CSS (E23): Tailwind compiled from the classes the page uses, with the brand as a theme (`brand`, `accent`,
 * `font-display`, `font-sans`), then cleaned (no url(), no @import: a page loads nothing it does not host) and minified.
 */
export interface PageTheme {
  primary: string
  accent: string | null
  heading: string
  body: string
}

/** A brand colour as a Tailwind scale, with `ink` (text on it) and `text` (itself, dark enough to read on white). */
function brandColors(hex: string): Record<string, string> {
  const base: Rgb = parseColor(hex) ?? [37, 99, 235]
  return { ...scale(base), DEFAULT: toHex(base), ink: toHex(readableOn(base)), text: toHex(textSafe(base, WHITE)) }
}

export function themeOf(t: PageTheme) {
  return {
    extend: {
      colors: { brand: brandColors(t.primary), accent: brandColors(t.accent ?? t.primary) },
      fontFamily: { display: [fontStack(t.heading)], sans: [fontStack(t.body)] },
    },
  }
}

/**
 * What a page needs before Tailwind's utilities: Tailwind's own base (preflight, MIT licence) reduced to the elements a
 * page may contain. The full preflight is read from disk, which the worker's bundle cannot do.
 */
export const RESET_CSS =
  "*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:#e5e7eb}::before,::after{--tw-content:''}" +
  "html{line-height:1.5;-webkit-text-size-adjust:100%;tab-size:4;-webkit-tap-highlight-color:transparent;scroll-behavior:smooth}" +
  "body{margin:0;line-height:inherit}hr{height:0;color:inherit;border-top-width:1px}abbr:where([title]){text-decoration:underline dotted}" +
  "h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}a{color:inherit;text-decoration:inherit}b,strong{font-weight:bolder}small{font-size:80%}" +
  "sub,sup{font-size:75%;line-height:0;position:relative;vertical-align:baseline}sub{bottom:-.25em}sup{top:-.5em}" +
  "table{text-indent:0;border-color:inherit;border-collapse:collapse}summary{display:list-item;cursor:pointer}" +
  "blockquote,dl,dd,h1,h2,h3,h4,h5,h6,hr,figure,p{margin:0}ol,ul{list-style:none;margin:0;padding:0}" +
  "img,svg{display:block;vertical-align:middle}img{max-width:100%;height:auto}[hidden]{display:none}" +
  ":focus-visible{outline:2px solid currentColor;outline-offset:2px}" +
  "@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,::before,::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}"

/** Removes what could make the page load something: url() (outside our fonts), @import, legacy expressions. */
function clean(root: Root): number {
  let removed = 0
  root.walkAtRules((rule) => {
    if (/^(import|charset|namespace|font-face)$/i.test(rule.name)) {
      rule.remove()
      removed++
    }
  })
  root.walkDecls((decl) => {
    if (/url\s*\(|expression\s*\(|image-set\s*\(|-moz-binding|behavior\s*:/i.test(`${decl.prop}:${decl.value}`)) {
      decl.remove()
      removed++
    }
  })
  root.walkComments((c) => {
    c.remove()
  })
  // A rule left empty (its only declaration was a url()) goes too.
  root.walkRules((rule) => {
    if (!rule.nodes?.length) rule.remove()
  })
  return removed
}

/** Whitespace out: Tailwind's output is regular, so trimming each node's spacing is enough. */
function minify(root: Root): string {
  root.walk((node) => {
    node.raws.before = ""
    node.raws.after = ""
    if (node.type === "decl") node.raws.between = ":"
    if (node.type === "rule") {
      node.raws.between = ""
      node.raws.semicolon = false
      node.selector = node.selector.replace(/\s*,\s*/g, ",").replace(/\s+/g, " ")
    }
    if (node.type === "atrule") {
      node.raws.between = ""
      node.raws.afterName = " "
      node.raws.semicolon = false
      node.params = node.params.replace(/\s*([:,])\s*/g, "$1").replace(/\s+/g, " ")
    }
  })
  root.raws.after = ""
  root.raws.semicolon = false
  return root.toString()
}

/** The CSS of a page body: only the utilities it uses, plus how many risky declarations were taken out. */
export async function compileCss(html: string, theme: PageTheme): Promise<{ css: string; removed: number }> {
  const config = { content: [{ raw: html, extension: "html" }], corePlugins: { preflight: false }, theme: themeOf(theme) }
  const result = await postcss([tailwindcss(config as Parameters<typeof tailwindcss>[0])]).process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined })
  const root = result.root
  const removed = clean(root)
  return { css: minify(root), removed }
}
