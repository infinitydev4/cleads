import { domainFromUrl } from "@/lib/crm/normalize"

/**
 * Templates are plain text with variables: `{{prenom}}`, or `{{prenom|Madame, Monsieur}}` with a fallback used when
 * the fiche has no value. A variable with neither a value nor a fallback blocks the send: "Bonjour {{prenom}}" must
 * never reach a prospect.
 */
export const VARIABLES = {
  prenom: "Prénom du contact",
  nom: "Nom complet du contact",
  entreprise: "Nom de l’entreprise",
  ville: "Ville",
  secteur: "Secteur",
  site: "Site web (domaine)",
  expediteur: "Votre nom, tel qu’affiché par la boîte",
  expediteur_prenom: "Votre prénom",
} as const

export type VariableName = keyof typeof VARIABLES
export type TemplateValues = Partial<Record<VariableName, string | null>>

const TOKEN = /\{\{\s*([a-zA-Z_]+)\s*(?:\|([^{}]*))?\}\}/g

const isVariable = (name: string): name is VariableName => Object.prototype.hasOwnProperty.call(VARIABLES, name)

/** Problems a template author must fix before saving: unknown names, braces left open. */
export function templateErrors(text: string): string[] {
  const errors: string[] = []
  for (const m of text.matchAll(TOKEN)) {
    const name = m[1].toLowerCase()
    if (!isVariable(name)) errors.push(`Variable inconnue : {{${m[1]}}}. Variables possibles : ${Object.keys(VARIABLES).map((v) => `{{${v}}}`).join(", ")}.`)
  }
  if (hasPlaceholder(text.replace(TOKEN, ""))) errors.push("Accolades mal fermées : une variable s’écrit {{prenom}}.")
  return [...new Set(errors)]
}

/** Leftover braces: a message must go out fully written. */
export const hasPlaceholder = (text: string) => /\{\{|\}\}/.test(text)

export function renderTemplate(text: string, values: TemplateValues): { text: string; missing: VariableName[] } {
  const missing = new Set<VariableName>()
  const out = text.replace(TOKEN, (whole, rawName: string, fallback: string | undefined) => {
    const name = rawName.toLowerCase()
    if (!isVariable(name)) return whole
    const value = values[name]?.trim()
    if (value) return value
    // An empty fallback (`{{prenom|}}`) means "leave it out".
    if (fallback !== undefined) return fallback.trim()
    missing.add(name)
    return whole
  })
  return { text: out, missing: [...missing] }
}

const firstWord = (s: string | null | undefined) => s?.trim().split(/\s+/)[0] || null

export function templateValues(input: { contactName?: string | null; companyName?: string | null; city?: string | null; sector?: string | null; website?: string | null; senderName?: string | null }): TemplateValues {
  return {
    prenom: firstWord(input.contactName),
    nom: input.contactName?.trim() || null,
    entreprise: input.companyName?.trim() || null,
    ville: input.city?.trim() || null,
    secteur: input.sector?.trim() || null,
    site: domainFromUrl(input.website),
    expediteur: input.senderName?.trim() || null,
    expediteur_prenom: firstWord(input.senderName),
  }
}
