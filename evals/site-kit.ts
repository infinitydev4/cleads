/**
 * Building blocks of the Auditeur's frozen sites (evals/sites.ts): plain HTML pages with their styles inline, that
 * load nothing from anywhere. Every business is fictional: `.example` domains, numbers from the range ARCEP keeps
 * for fiction (01 99 00 xx xx). Tags and scripts are written the way real sites carry them, so the audit's detectors
 * read them; they never run.
 */
export interface PageOptions {
  title: string | null
  description?: string | null
  /** The mobile viewport meta; a site « not made for phones » has none. */
  viewport?: boolean
  generator?: string
  openGraph?: boolean
  /** Scripts, JSON-LD, stylesheets: what the audit's stack detection reads. */
  head?: string[]
  /** "dated": tables, small serif text and loud colours; "modern": the default. */
  look?: "modern" | "dated"
  body: string
}

const MODERN = `
  *{box-sizing:border-box}body{margin:0;font-family:Inter,Helvetica,Arial,sans-serif;color:#1f2933;line-height:1.6;background:#fff}
  header,section,footer{padding:32px 24px;max-width:1080px;margin:0 auto}nav a{margin-right:18px;color:#1f2933;text-decoration:none;font-weight:600}
  h1{font-size:40px;line-height:1.15;margin:24px 0 12px}h2{font-size:26px;margin:0 0 12px}.cta{display:inline-block;background:#0f766e;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:700;margin-right:12px}
  .muted{color:#52606d}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.card{border:1px solid #e4e7eb;border-radius:12px;padding:18px}
  footer{border-top:1px solid #e4e7eb;font-size:14px;color:#52606d}form label{display:block;margin:8px 0 4px}input,textarea{width:100%;padding:10px;border:1px solid #cbd2d9;border-radius:8px}`
const DATED = `
  body{margin:0;font-family:"Times New Roman",serif;font-size:13px;color:#000;background:#d9e8f5}table{width:960px;margin:0 auto;background:#fff}
  h1{font-size:22px;color:#b00;font-family:Arial,sans-serif}h2{font-size:16px;color:#036}nav a{color:#00f;margin-right:8px}
  .cta{color:#00f;text-decoration:underline}.card{border:1px dashed #999;padding:6px;margin:6px 0}footer{font-size:11px;color:#555;text-align:center}`

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export function page(o: PageOptions): string {
  const dated = o.look === "dated"
  const meta = [
    `<meta charset="utf-8">`,
    o.viewport === false ? null : `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    o.title ? `<title>${esc(o.title)}</title>` : null,
    o.description ? `<meta name="description" content="${esc(o.description)}">` : null,
    o.generator ? `<meta name="generator" content="${esc(o.generator)}">` : null,
    o.openGraph && o.title ? `<meta property="og:title" content="${esc(o.title)}">` : null,
    `<style>${dated ? DATED : MODERN}</style>`,
    ...(o.head ?? []),
  ].filter(Boolean)
  const body = dated ? `<table><tr><td>${o.body}</td></tr></table>` : o.body
  return `<!doctype html>\n<html lang="fr">\n<head>\n${meta.join("\n")}\n</head>\n<body>\n${body}\n</body>\n</html>\n`
}

/** The site's menu: `[path, label]`, internal paths. */
export const nav = (links: readonly (readonly [string, string])[]) => `<nav>${links.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join("")}</nav>`

export const header = (name: string, links: readonly (readonly [string, string])[]) => `<header><strong>${esc(name)}</strong>${nav(links)}</header>`

/** A telephone link, written as French sites write it. */
export const tel = (phone: string, label = phone) => `<a class="cta" href="tel:${phone.replace(/\s/g, "")}">${esc(label)}</a>`

export const mail = (address: string) => `<a href="mailto:${address}">${esc(address)}</a>`

export function contactForm(fields: readonly string[] = ["Nom", "Téléphone", "Votre demande"]): string {
  return `<form action="/merci" method="post">${fields.map((f, i) => `<label for="f${i}">${esc(f)}</label>${f.length > 18 ? `<textarea id="f${i}" name="f${i}"></textarea>` : `<input id="f${i}" name="f${i}">`}`).join("")}<button type="submit">Envoyer</button></form>`
}

export function footer(o: { name: string; year: number; address?: string; phone?: string; socials?: readonly string[]; extra?: string }): string {
  const socials = (o.socials ?? []).map((url) => `<a href="${url}">${esc(new URL(url).hostname.replace(/^www\./, "").split(".")[0])}</a>`).join(" · ")
  return `<footer><p>© ${o.year} ${esc(o.name)}${o.address ? ` · ${esc(o.address)}` : ""}${o.phone ? ` · ${esc(o.phone)}` : ""}</p>${socials ? `<p>${socials}</p>` : ""}${o.extra ?? ""}<p><a href="/mentions-legales">Mentions légales</a></p></footer>`
}

export const section = (title: string, html: string) => `<section><h2>${esc(title)}</h2>${html}</section>`

export const paragraphs = (...lines: string[]) => lines.map((l) => `<p>${esc(l)}</p>`).join("")

export const cards = (items: readonly (readonly [string, string])[]) => `<div class="grid">${items.map(([t, d]) => `<div class="card"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`).join("")}</div>`

export function faq(items: readonly (readonly [string, string])[]): string {
  return section("Questions fréquentes", items.map(([q, a]) => `<details open><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join(""))
}

export const jsonLd = (data: Record<string, unknown>) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...data })}</script>`

export function faqSchema(items: readonly (readonly [string, string])[]): string {
  return jsonLd({ "@type": "FAQPage", mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) })
}

/** Google Analytics 4 (and Google Ads when an AW id is given), as gtag.js is pasted. */
export function gtag(ga4: string, ads?: string): string {
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${ga4}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ga4}');${ads ? `gtag('config','${ads}');` : ""}</script>`
}

export const metaPixel = (id = "120000000000001") =>
  `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/fr_FR/fbevents.js');fbq('init','${id}');fbq('track','PageView');</script>`

/** An old WordPress, its theme and the jQuery it shipped with. */
export const wordpress = (version: string, jquery = "1.12.4") => [
  `<link rel="stylesheet" href="/wp-content/themes/artisan-pro/style.css?ver=${version}">`,
  `<script src="/wp-includes/js/jquery-${jquery}.min.js"></script>`,
]

export const jquery = (version: string) => `<script src="/js/jquery-${version}.min.js"></script>`

/** The bottom of a page that only says who publishes the site. */
export const legalPage = (name: string, year: number) =>
  page({ title: `Mentions légales — ${name}`, body: `<section><h1>Mentions légales</h1>${paragraphs(`Site édité par ${name}.`, "Hébergement : un hébergeur européen.")}</section>${footer({ name, year })}` })
