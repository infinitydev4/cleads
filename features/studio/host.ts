/**
 * The host the Studio Web's previews are served on (E23): STUDIO_PREVIEW_HOST, apercu.cleads.fr in production by
 * default, none in development (pages are then served under /apercu on the CRM's own host). No import here: the proxy
 * reads it on every request.
 */
export function previewHost(): string | null {
  const host = process.env.STUDIO_PREVIEW_HOST?.trim().toLowerCase()
  if (host) return /^[a-z0-9.-]+(:\d+)?$/.test(host) ? host : null
  return process.env.NODE_ENV === "production" ? "apercu.cleads.fr" : null
}

/** Whether a request reached the preview host (any host in development, where there is none). */
export function onPreviewHost(hostHeader: string | null): boolean {
  const host = previewHost()
  if (!host) return process.env.NODE_ENV !== "production"
  return (hostHeader ?? "").split(",")[0].trim().toLowerCase() === host
}
