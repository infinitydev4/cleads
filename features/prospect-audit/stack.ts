import type { PageFacts } from "./html"

/**
 * detect_stack (docs/crm-v1/AGENTS-IA.md §9): the CMS and its version, the measurement and advertising tags, the online
 * booking tools. Read from the pages' tags, scripts and assets only; nothing is executed.
 */
export interface StackFacts {
  cms: { name: string; version: string | null } | null
  /** Identifiers are cut to their first characters: enough to show a tag exists. */
  tags: { ga4: string[]; gtm: string[]; googleAds: string[]; metaPixel: boolean; otherAnalytics: string[] }
  booking: string[]
  jquery: string | null
}

const CMS: [string, RegExp][] = [
  ["WordPress", /\/wp-content\/|\/wp-includes\//i],
  ["Wix", /static\.wixstatic\.com|parastorage\.com/i],
  ["Squarespace", /static1\.squarespace\.com|squarespace-cdn\.com/i],
  ["Shopify", /cdn\.shopify\.com/i],
  ["Webflow", /assets\.website-files\.com|webflow\.com\/js/i],
  ["Jimdo", /jimdo|jimstatic\.com/i],
  ["Joomla", /\/media\/jui\/|\/components\/com_/i],
  ["Drupal", /\/sites\/default\/files\/|drupal\.js/i],
  ["PrestaShop", /prestashop|\/modules\/ps_/i],
  ["Duda", /dudaone|multiscreensite\.com/i],
  ["GoDaddy", /img1\.wsimg\.com/i],
  ["Site123", /site123\.(com|me)/i],
  ["Hostinger Website Builder", /zyrosite\.com|userapp\.zyrosite/i],
]

const BOOKING: [string, RegExp][] = [
  ["Calendly", /calendly\.com/i],
  ["Doctolib", /doctolib\.(fr|de|it)/i],
  ["Planity", /planity\.com/i],
  ["TheFork", /thefork\.|lafourchette\./i],
  ["Zenchef", /zenchef\.com/i],
  ["Resengo", /resengo\.com/i],
  ["Treatwell", /treatwell\./i],
  ["Booksy", /booksy\.com/i],
  ["SimplyBook", /simplybook\./i],
  ["Google Agenda", /calendar\.google\.com\/calendar\/appointments/i],
  ["Acuity", /acuityscheduling\.com/i],
  ["Setmore", /setmore\.com/i],
]

const OTHER_ANALYTICS: [string, RegExp][] = [
  ["Matomo", /matomo|piwik/i],
  ["Plausible", /plausible\.io/i],
  ["Hotjar", /hotjar\.com/i],
  ["Microsoft Clarity", /clarity\.ms/i],
  ["Universal Analytics", /google-analytics\.com\/analytics\.js|['"]UA-\d+-\d+/i],
]

const cut = (id: string) => (id.length > 8 ? `${id.slice(0, 7)}…` : id)
const unique = (list: string[]) => [...new Set(list)]

export function detectStack(pages: readonly PageFacts[]): StackFacts {
  const haystack = pages.flatMap((p) => [...p.scripts, ...p.assets, ...p.iframes, ...p.links.map((l) => l.href)]).join("\n")
  const inline = pages.map((p) => p.inlineScripts).join("\n")
  const all = `${haystack}\n${inline}`
  const generator = pages.map((p) => p.generator).find(Boolean) ?? null

  let cms: StackFacts["cms"] = null
  if (generator) {
    const m = /^([A-Za-z][\w .-]*?)\s+v?(\d+(?:\.\d+){0,2})/.exec(generator)
    cms = m ? { name: m[1].trim(), version: m[2] } : { name: generator.slice(0, 40), version: null }
  }
  // A generator that names a plugin or a theme ("Elementor 3.2") gives way to a CMS recognised from its assets.
  if (!cms || !CMS.some(([n]) => cms!.name.toLowerCase().startsWith(n.toLowerCase()))) {
    const found = CMS.find(([, re]) => re.test(haystack))
    if (found) cms = { name: found[0], version: null }
  }
  if (cms?.name.toLowerCase().startsWith("wordpress") && !cms.version) {
    cms.version = /ver=(\d+\.\d+(?:\.\d+)?)/.exec(pages.flatMap((p) => p.assets.filter((a) => /wp-includes/.test(a))).join(" "))?.[1] ?? null
  }

  const ids = (re: RegExp) => unique([...all.matchAll(re)].map((m) => cut(m[1])))
  return {
    cms,
    tags: {
      ga4: ids(/\b(G-[A-Z0-9]{6,12})\b/g),
      gtm: ids(/\b(GTM-[A-Z0-9]{4,10})\b/g),
      googleAds: ids(/\b(AW-\d{6,12})\b/g),
      metaPixel: /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*['"]init['"]/i.test(all),
      otherAnalytics: OTHER_ANALYTICS.filter(([, re]) => re.test(all)).map(([n]) => n),
    },
    booking: BOOKING.filter(([, re]) => re.test(all)).map(([n]) => n),
    jquery: /jquery[.-]?(\d+\.\d+(?:\.\d+)?)(?:\.min)?\.js/i.exec(haystack)?.[1] ?? null,
  }
}

/** A CMS version old enough to be a security and maintenance risk. */
export function isOutdatedCms(cms: StackFacts["cms"]): boolean {
  if (!cms?.version) return false
  const major = Number(cms.version.split(".")[0])
  const name = cms.name.toLowerCase()
  if (name.startsWith("wordpress")) return major < 6
  if (name.startsWith("joomla")) return major < 4
  if (name.startsWith("drupal")) return major < 9
  if (name.startsWith("prestashop")) return major < 8
  return false
}
