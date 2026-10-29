import { normalizeName } from "@/lib/crm/normalize"

/** Fields of an imported row. The CSV wizard maps columns to these; the Extractor import (E5) produces them directly. */
export const IMPORT_FIELDS = [
  { key: "name", label: "Nom de l’entreprise", required: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Téléphone" },
  { key: "website", label: "Site web" },
  { key: "address", label: "Adresse" },
  { key: "postalCode", label: "Code postal" },
  { key: "city", label: "Ville" },
  { key: "country", label: "Pays (2 lettres)" },
  { key: "sector", label: "Secteur" },
  { key: "siret", label: "SIRET" },
  { key: "contactName", label: "Nom du contact" },
  { key: "jobTitle", label: "Fonction du contact" },
  { key: "tags", label: "Étiquettes" },
  { key: "externalId", label: "Identifiant source" },
] as const

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"]
export type ImportRow = Partial<Record<ImportField, string>>
export type ColumnMapping = Record<string, ImportField | "">

// Header spellings seen in prospect exports (French and English), compared after normalisation.
const SYNONYMS: Record<ImportField, string[]> = {
  name: ["nom", "nom entreprise", "nom de l entreprise", "entreprise", "societe", "raison sociale", "denomination", "company", "company name", "name", "etablissement", "title"],
  email: ["email", "e mail", "mail", "courriel", "adresse email", "adresse mail", "emails"],
  phone: ["telephone", "tel", "phone", "mobile", "numero", "numero de telephone", "phone number", "portable"],
  website: ["site", "site web", "website", "url", "web", "site internet", "domaine", "domain"],
  address: ["adresse", "address", "rue", "street", "adresse postale"],
  postalCode: ["code postal", "cp", "postal code", "zip", "zipcode"],
  city: ["ville", "city", "commune", "localite"],
  country: ["pays", "country", "code pays"],
  sector: ["secteur", "categorie", "activite", "category", "industry", "metier", "type", "naf"],
  siret: ["siret", "numero siret"],
  contactName: ["contact", "nom du contact", "nom contact", "interlocuteur", "dirigeant", "gerant", "contact name", "prenom nom", "responsable"],
  jobTitle: ["fonction", "poste", "titre", "job title", "role", "qualite"],
  tags: ["etiquettes", "tags", "etiquette", "labels", "segment"],
  externalId: ["id", "identifiant", "reference", "ref", "id source", "external id", "place id", "place_id", "cid"],
}

/** Best guess of what each column holds; a field is given to the first matching column only. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const used = new Set<ImportField>()
  for (const header of headers) {
    const n = normalizeName(header).replace(/\b(sarl|sas)\b/g, "").trim() || header.toLowerCase().trim()
    const norm = n.replace(/_/g, " ")
    const match = (Object.keys(SYNONYMS) as ImportField[]).find((field) => !used.has(field) && SYNONYMS[field].includes(norm))
    mapping[header] = match ?? ""
    if (match) used.add(match)
  }
  return mapping
}

/** Applies a mapping to a parsed row. Columns mapped to the same field are joined in order (first non-empty wins). */
export function mapRow(raw: Record<string, string | undefined>, mapping: ColumnMapping): ImportRow {
  const row: ImportRow = {}
  for (const [column, field] of Object.entries(mapping)) {
    if (!field) continue
    const value = raw[column]?.toString().trim()
    if (value && !row[field]) row[field] = value
  }
  return row
}
