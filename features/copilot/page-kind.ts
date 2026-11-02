import { parseLeadFilters, type LeadFilters } from "@/features/leads/schemas"

/**
 * Where the person is when they ask (E24): the page of the CRM, read from its address. The panel sends the address of
 * the page it sits on (in the 3D view, the page of the open window); the copilot answers about it without being told
 * ("cette fiche", "cette campagne", "la liste affichée"). Nothing here is trusted: ids are checked against what the
 * person may see before they reach the model.
 */
export type PageKind = "today" | "leads" | "lead" | "campaigns" | "campaign" | "pipeline" | "meetings" | "studio" | "site" | "mailbox" | "agents" | "hq" | "other"

export interface PageRef {
  kind: PageKind
  /** The address as received, normalised: /app/… with its query. */
  path: string
  id?: string
  /** The list's filters, on the fiches list. */
  filters?: LeadFilters
}

const LEAD_PAGES = new Set(["new", "import", "duplicates"])
const ID = /^[a-z0-9]{8,40}$/i

/** The page an address points to; null for anything outside the CRM. */
export function parsePage(raw: string | null | undefined): PageRef | null {
  if (!raw || raw.length > 2_000) return null
  let url: URL
  try {
    url = new URL(raw, "http://cleads.invalid")
  } catch {
    return null
  }
  if (url.origin !== "http://cleads.invalid") return null
  const segments = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean)
  if (segments[0] !== "app") return null
  const path = `${url.pathname}${url.search}`.slice(0, 500)
  const [, section, id, ...rest] = segments
  const withId = (kind: PageKind, list: PageKind): PageRef => (id && ID.test(id) && !rest.length ? { kind, path, id } : { kind: list, path })

  switch (section) {
    case undefined:
      return { kind: "today", path }
    case "leads":
      if (id && !LEAD_PAGES.has(id)) return withId("lead", "leads")
      return { kind: "leads", path, filters: id ? undefined : parseLeadFilters(Object.fromEntries(url.searchParams)) }
    case "campaigns":
      return withId("campaign", "campaigns")
    case "pipeline":
      return { kind: "pipeline", path }
    case "meetings":
      return { kind: "meetings", path }
    case "studio":
      return withId("site", "studio")
    case "mailbox":
      return { kind: "mailbox", path }
    case "agents":
      return { kind: "agents", path }
    case "3d":
      return { kind: "hq", path }
    default:
      return { kind: "other", path }
  }
}

/** The kind of page an address shows, for the panel's suggestions. */
export const parsePageKind = (path: string): PageKind | null => parsePage(path)?.kind ?? null
