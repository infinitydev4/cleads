/**
 * Windows of the 3D view (E16). In /app/3d, a CRM page opens in a window over the scene instead of leaving it: the
 * search form, the CSV import, the pipeline, a campaign… The page is the 2D page itself, loaded in a frame without the
 * shell around it, so every module works in 3D with its own rules and nothing is written twice.
 *
 * The open window is part of the address (/app/3d?w=/app/pipeline): the back button closes it and a reload reopens it.
 * The top bar, the palette and the scene's panels open windows through this module; the page inside talks to the view
 * with messages (components/crm/shell/embed-bridge.tsx).
 */

export const HQ_PATH = "/app/3d"
export const WINDOW_PARAM = "w"
/** Tag of the messages a page in a window sends to the 3D view (same origin only). */
export const WINDOW_MESSAGE = "cleads-hq-window"

export type WindowMessageBody = { type: "location"; path: string; title: string } | { type: "close" } | { type: "copilot" }
export type WindowMessage = WindowMessageBody & { source: typeof WINDOW_MESSAGE }

/** Origin used to read an address when there is no page to resolve it against (server render, tests). */
const DETACHED = "http://cleads.invalid"

/**
 * The CRM page a link or an address points to, if it may open in a window: same site, under /app, not the 3D view
 * itself. Anything else (another site, "//host", javascript:, mailto:, the legacy back-office) gives null.
 */
export function windowPath(href: string | null | undefined, origin = DETACHED): string | null {
  if (!href) return null
  let url: URL
  try {
    url = new URL(href, origin)
  } catch {
    return null
  }
  if (url.origin !== origin) return null
  const { pathname } = url
  if (pathname !== "/app" && !pathname.startsWith("/app/")) return null
  if (pathname === HQ_PATH || pathname.startsWith(`${HQ_PATH}/`)) return null
  return `${pathname}${url.search}`
}

const addressOf = (path: string | null) => (path ? `${HQ_PATH}?${WINDOW_PARAM}=${encodeURIComponent(path)}` : HQ_PATH)

// Whether the open window has its own history entry, which closing can then simply go back over.
let pushed = false

/** Opens a page in a window of the 3D view. A new history entry, unless a window is already open: it is replaced. */
export function openHqWindow(path: string) {
  const open = new URLSearchParams(window.location.search).has(WINDOW_PARAM)
  if (open) {
    window.history.replaceState(null, "", addressOf(path))
  } else {
    window.history.pushState(null, "", addressOf(path))
    pushed = true
  }
}

/** Keeps the address on the page the window shows after a navigation inside it, without a history entry. */
export function followHqWindow(path: string) {
  window.history.replaceState(null, "", addressOf(path))
}

/**
 * Closes the window. When it was opened here and nothing was visited inside it, going back removes its entry; otherwise
 * (pages visited inside the window share the tab's history, or the window came with the address) the entry is
 * rewritten to the plain 3D view.
 */
export function closeHqWindow({ visited }: { visited: boolean }) {
  if (pushed && !visited) window.history.back()
  else window.history.replaceState(null, "", HQ_PATH)
  pushed = false
}

/** The back button closed the window, or the window came with the address: no entry of ours to go back over. */
export function forgetHqWindowEntry() {
  pushed = false
}
