/** Batches for the closers (features/lots/service.ts): what a manager's sentence asks for, read without any model. Safe in the browser. */

export const MAX_LOT = 200

export interface LotRequest {
  activity: string
  location: string
  count: number
  noSite: boolean
}

/**
 * Reads « Trouve 100 électriciens à Nantes sans site web » without any model: a number, a trade, « à / sur / dans » a
 * place, and whether it wants businesses without a site. Whatever it cannot read is left for the form.
 */
export function parseLotPrompt(prompt: string): Partial<LotRequest> {
  const text = prompt.replace(/\s+/g, " ").trim()
  const out: Partial<LotRequest> = {}
  const count = text.match(/\b(\d{1,3})\b/)
  if (count) out.count = Math.min(MAX_LOT, Math.max(1, Number(count[1])))
  out.noSite = /sans (vrai )?site|pas de site|n['’]ont pas de site|aucun site/i.test(text)
  // No \b around « à »: JavaScript's word boundaries only know ASCII letters.
  const where = text.match(/(?:^|\s)(?:à|a|sur|dans|autour de|près de)\s+([A-ZÀ-Ý][\p{L}' -]+?)(?=\s+(?:sans|avec|et|qui|pour)\b|[,.]|$)/u)
  if (where) out.location = where[1].trim()
  const trade = text.match(/\d{1,3}\s+([\p{L}'-]+(?:\s+[\p{L}'-]+)?)\s+(?:à|a|sur|dans|autour de|près de)(?=\s)/u)
  if (trade) out.activity = singular(trade[1].trim().toLowerCase())
  return out
}

/** « électriciens » → « électricien », « plombiers chauffagistes » → « plombier chauffagiste ». */
const singular = (words: string) => words.split(" ").map((w) => (w.length > 3 && /[sx]$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w)).join(" ")

/** « Électriciens à Nantes sans site web ». */
export function lotName(r: LotRequest): string {
  const trade = r.activity.charAt(0).toUpperCase() + r.activity.slice(1)
  return `${/s$/.test(trade) ? trade : `${trade}s`} à ${r.location}${r.noSite ? " sans site web" : ""}`.slice(0, 80)
}

