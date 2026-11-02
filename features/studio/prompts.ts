import { untrusted } from "@/lib/ai/untrusted"
import { CRITERIA_HINTS, CRITERIA_LABELS, SECTION_LABELS } from "./labels"
import { CRITERIA, type AxeSummary, type Brief, type Collected, type Critique } from "./schemas"
import type { StaticChecks } from "./document"

/**
 * What the Designer web reads at each step (E23). Everything that comes from the prospect (its pages, its texts, the
 * brief written from them) is fenced as outside content; the instructions come after it. The banner, the head of the
 * page and its legal mentions are the CRM's: the model never writes them.
 */
export interface BriefContext {
  company: string
  collected: Collected
  /** Text of each page read, by id (P1…). */
  pages: { id: string; url: string; title: string | null; text: string }[]
  audit: { id: string; text: string }[]
  fonts: readonly string[]
}

const list = (items: readonly string[]) => items.map((i) => `- ${i}`).join("\n") || "- aucune"

export function briefPrompt(c: BriefContext): string {
  const imgs = c.collected.images.map((i) => `${i.name} (${i.kind === "logo" ? "logo" : "photo"}, ${i.width}×${i.height}${i.alt ? `, « ${i.alt} »` : ""})`)
  const facts = [
    `Fiche :\n${list(c.collected.facts.map((f) => `${f.id} ${f.label} : ${f.value}`))}`,
    `Constats de l'audit :\n${list(c.audit.map((a) => `${a.id} ${a.text}`))}`,
    `Images du site, hébergées avec la page :\n${list(imgs)}`,
    `Couleurs relevées sur le site : ${c.collected.colors.map((x) => `${x.hex} (${x.source === "logo" ? "logo" : x.source === "theme" ? "couleur déclarée" : "feuilles de style"})`).join(", ") || "aucune"}`,
    `Polices relevées sur le site : ${c.collected.fonts.join(", ") || "aucune"}`,
  ].join("\n\n")
  const pages = c.pages.map((p) => `${p.id} — ${p.title ?? "(sans titre)"} — ${p.url}\n${p.text}`).join("\n\n")
  return [
    `Fiche, constats de l'audit et images de ${c.company}. Cite les preuves par leur identifiant.\n${untrusted(facts, { source: "fiche et audit", maxChars: 10_000 })}`,
    pages ? `Pages du site actuel :\n${untrusted(pages, { source: c.collected.url ?? "site du prospect", maxChars: 24_000 })}` : "L'entreprise n'a pas de site lisible : appuie-toi sur la fiche et l'audit.",
    [
      "Écris le brief de la landing de démonstration de cette entreprise, selon la charte du Studio :",
      "- positionnement, public et ton ; un titre de premier écran tourné vers le bénéfice du client (90 caractères au plus) et un sous-titre avec le métier et la zone ;",
      `- 4 à 7 sections dans l'ordre de la page, la première de type hero, la dernière de type contact (types : ${Object.keys(SECTION_LABELS).join(", ")}). Leurs points reprennent seulement ce que disent les pages (P…) ou la fiche (F…), reformulé clairement : aucun chiffre, avis, label, année, prix ni client qui n'y figure ;`,
      "- une section de preuves seulement avec des preuves réelles : la note Google de la fiche avec son nombre d'avis, des réalisations ou des labels cités par le site. Jamais d'avis rédigé ;",
      "- la palette : la couleur principale de la marque (logo ou site) et une couleur d'accent si la marque en a une ; à défaut, une palette sobre adaptée au métier. Couleurs au format #rrggbb ;",
      `- deux polices de cette liste (titres, texte) : ${c.fonts.join(", ")}. Si le site utilise l'une d'elles, garde-la ;`,
      "- les images à montrer et leur texte alternatif, seulement parmi celles de la liste : le logo s'il y en a un, la meilleure photo en premier écran ;",
      "- le bouton principal : phone si la fiche a un téléphone, booking si elle a une réservation en ligne et que c'est le geste attendu dans ce métier, sinon email ;",
      "- ce qui change par rapport au site actuel (3 à 5 points), chacun appuyé sur un constat de l'audit (A…) ou une page (P…).",
      "Un point qui ne cite aucune preuve existante sera retiré.",
    ].join("\n"),
  ].join("\n\n")
}

/** The rules every version of the page follows, written once for the generation, the fixes and the instructions. */
export const PAGE_RULES = [
  "- seulement le contenu du <body> : ni <html>, ni <head>, ni bandeau « maquette » (le CRM les ajoute) ;",
  "- HTML5 sémantique : <header>, <main> avec une <section id=\"…\"> par section, <footer> ; un seul <h1> ; des titres dans l'ordre ; du texte en français ;",
  "- classes Tailwind CSS 3 uniquement : ni <style>, ni attribut style, ni script, ni formulaire, ni iframe, ni <button> (une action est un lien <a>) ;",
  "- thème : couleurs `brand` et `accent` (nuances 50 à 950), `brand-ink` pour le texte posé sur la couleur, `brand-text` pour la couleur en texte sur fond clair ; polices `font-display` pour les titres et `font-sans` pour le texte ;",
  "- images : <img src=\"asset:NOM\" alt=\"…\"> seulement avec les noms donnés ; une image de fond est une <img> en absolute avec object-cover sous un voile qui garde le texte lisible, jamais une image de fond en CSS ;",
  "- liens : tel:, mailto:, ancres #id de la page, et https: seulement vers la réservation en ligne de la fiche ;",
  "- icônes : SVG en ligne simples (path, circle, rect, line, polyline), stroke=\"currentColor\", aria-hidden=\"true\" ;",
  "- une FAQ éventuelle en <details> et <summary> ;",
  "- mobile d'abord (sm:, md:, lg:) ; texte courant de 16 px au moins ; contrastes de 4,5:1 au moins ; zones cliquables de 44 px ; rien ne déborde à 390 px ;",
  "- aucun fait, chiffre, avis, label, prix ni client qui ne soit dans le brief ou les coordonnées ; aucun lien vers des réseaux sociaux ni vers des mentions légales.",
].join("\n")

export interface PageContext {
  company: string
  brief: Brief
  contact: Collected["contact"]
  assets: { name: string; kind: string; width: number | null; height: number | null; label: string | null }[]
  fonts: { heading: string; body: string }
}

function briefText(b: Brief): string {
  const sections = b.sections
    .map((s, i) => `${i + 1}. ${SECTION_LABELS[s.kind]} — « ${s.title} »${s.points.length ? `\n${s.points.map((p) => `   - ${p.text}`).join("\n")}` : ""}`)
    .join("\n")
  return [
    `Positionnement : ${b.positioning}`,
    `Public : ${b.audience}`,
    `Ton : ${b.tone}`,
    `Titre : ${b.headline}`,
    `Sous-titre : ${b.subheadline}`,
    `Sections, dans l'ordre :\n${sections}`,
    `Bouton principal : « ${b.cta.label} » (${b.cta.kind === "phone" ? "appel" : b.cta.kind === "email" ? "email" : "réservation en ligne"})`,
    `Images : ${b.images.map((i) => `${i.name} (${i.use}) « ${i.alt} »`).join(" ; ") || "aucune"}`,
  ].join("\n")
}

function contactText(c: Collected["contact"]): string {
  const tel = c.phone ? c.phone.replace(/[^\d+]/g, "") : null
  return list(
    [
      c.phone && `Téléphone : ${c.phone} (lien tel:${tel?.startsWith("0") ? `+33${tel.slice(1)}` : tel})`,
      c.email && `Email : ${c.email} (lien mailto:)`,
      c.address && `Adresse : ${c.address}`,
      c.booking && `Réservation en ligne : ${c.booking}`,
    ].filter((x): x is string => !!x)
  )
}

function context(p: PageContext): string {
  const assets = p.assets.filter((a) => a.kind !== "font").map((a) => `asset:${a.name} — ${a.kind === "logo" ? "logo" : "photo"}${a.width ? ` ${a.width}×${a.height}` : ""}${a.label ? ` « ${a.label} »` : ""}`)
  const fenced = `${briefText(p.brief)}\n\nCoordonnées, à reprendre telles quelles :\n${contactText(p.contact)}`
  return [
    `Brief de la page de ${p.company}, écrit à partir de son site et relu par l'équipe :\n${untrusted(fenced, { source: "brief et fiche", maxChars: 12_000 })}`,
    p.brief.notes ? `Consignes de l'équipe pour cette page :\n${p.brief.notes}` : null,
    `Images disponibles :\n${list(assets)}`,
    `Couleurs : principale ${p.brief.palette.primary}${p.brief.palette.accent ? `, accent ${p.brief.palette.accent}` : ""}. Polices : ${p.fonts.heading} (titres), ${p.fonts.body} (texte).`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function pagePrompt(p: PageContext): string {
  return [context(p), `Écris le code de la landing de démonstration, selon la charte du Studio :\n${PAGE_RULES}`, "Rends uniquement le code, dans un bloc ```html."].join("\n\n")
}

export interface Findings {
  critique: Critique | null
  axe: AxeSummary | null
  markup: StaticChecks
}

const SEVERITY = { high: "Fort", medium: "Moyen", low: "Faible" } as const

/** What the checks found, as a list of things to fix. */
export function findingsText(f: Findings): string {
  const lines: string[] = []
  for (const i of f.critique?.issues ?? []) lines.push(`[${SEVERITY[i.severity]}] ${CRITERIA_LABELS[i.criterion]} : ${i.problem} → ${i.fix}`)
  for (const v of f.axe?.violations ?? []) if (v.impact === "critical" || v.impact === "serious") lines.push(`[Accessibilité, ${v.impact}] ${v.help} (${v.nodes} élément${v.nodes > 1 ? "s" : ""}, par exemple ${v.sample})`)
  if (f.markup.h1 !== 1) lines.push(`[Balisage] La page a ${f.markup.h1} titre${f.markup.h1 > 1 ? "s" : ""} <h1> : il en faut un seul.`)
  if (f.markup.placeholders.length) lines.push(`[Contenu] Textes provisoires à retirer : ${f.markup.placeholders.join(", ")}.`)
  if (f.markup.emptyAlt) lines.push(`[Accessibilité] ${f.markup.emptyAlt} image${f.markup.emptyAlt > 1 ? "s" : ""} sans texte alternatif.`)
  return lines.join("\n") || "- rien de bloquant"
}

export function fixPrompt(p: PageContext, body: string, f: Findings): string {
  return [
    context(p),
    `La page actuelle (le contenu du <body>) :\n\`\`\`html\n${body}\n\`\`\``,
    `La critique visuelle et les contrôles relèvent :\n${findingsText(f)}`,
    `Corrige ces défauts sans toucher à ce qui fonctionne, en gardant le contenu. Les règles restent :\n${PAGE_RULES}`,
    "Rends la page entière corrigée, dans un bloc ```html.",
  ].join("\n\n")
}

export function revisePrompt(p: PageContext, body: string, instruction: string): string {
  return [
    context(p),
    `La page actuelle (le contenu du <body>) :\n\`\`\`html\n${body}\n\`\`\``,
    `La personne qui prépare le rendez-vous demande : « ${instruction.replace(/\s+/g, " ").trim()} »`,
    `Applique cette demande, et rien d'autre. Si elle demande un fait que ni le brief ni les coordonnées ne donnent (un avis, un chiffre, un label, un prix), ne l'invente pas : laisse cette partie de côté. Les règles restent :\n${PAGE_RULES}`,
    "Rends la page entière, dans un bloc ```html.",
  ].join("\n\n")
}

export function critiquePrompt(c: { company: string; brief: Brief; desktop: number; mobile: number; axe: AxeSummary | null; markup: StaticChecks }): string {
  const axe = c.axe ? `axe-core : ${c.axe.critical} erreur(s) critique(s), ${c.axe.serious} sérieuse(s), ${c.axe.moderate} moyenne(s)${c.axe.violations.length ? ` (${c.axe.violations.slice(0, 5).map((v) => v.id).join(", ")})` : ""}` : "axe-core : non exécuté"
  return [
    `Captures de la landing de démonstration de ${c.company} : ${c.desktop} écran${c.desktop > 1 ? "s" : ""} sur ordinateur (1440 px de large), puis ${c.mobile} sur téléphone (390 px), dans l'ordre de la page.`,
    `Ce que la page doit porter : titre « ${c.brief.headline} », couleur principale ${c.brief.palette.primary}, polices ${c.brief.fonts.heading} et ${c.brief.fonts.body}, bouton « ${c.brief.cta.label} ».`,
    `Contrôles automatiques : ${axe} ; ${c.markup.h1} titre <h1>.`,
    [
      "Évalue la page sur la grille, de 1 (à refaire) à 5 (excellent) :",
      ...CRITERIA.map((k) => `- ${k} (${CRITERIA_LABELS[k].toLowerCase()}) : ${CRITERIA_HINTS[k]} ;`),
      "Liste ensuite les défauts visibles sur les captures, du plus grave au moins grave, chacun avec la correction à faire (en classes Tailwind si c'est utile). Ne juge que ce que tu vois ; le bandeau sombre du haut est ajouté par le CRM, ne le critique pas.",
    ].join("\n"),
  ].join("\n\n")
}
