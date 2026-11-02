import { notFound, onPreviewHost, recordVisit, robotsTxt, serveAsset, servePage } from "@/features/studio/preview"

export const dynamic = "force-dynamic"

/**
 * The Studio's public previews (E23). On the preview host every address is rewritten here (next.config, proxy.ts):
 * `/<token>` the page, `/<token>/a/<name>` an image or a font, `/<token>/vu` the visit beacon. On any other host
 * these addresses do not exist, except in development where no preview host is set.
 */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  if (!onPreviewHost(host)) return new Response("Not found", { status: 404 })
  const path = (await params).path
  // Rewritten twice (Netlify, then Next): a token is never « apercu », so the extra prefix is dropped.
  const [token, ...rest] = path[0] === "apercu" ? path.slice(1) : path
  if (!token) return notFound()
  if (token === "robots.txt" && !rest.length) return robotsTxt()
  if (!rest.length) return servePage(token)
  if (rest.length === 1 && rest[0] === "vu") return recordVisit(token, request.headers.get("user-agent"))
  if (rest.length === 2 && rest[0] === "a") return serveAsset(token, rest[1])
  return notFound()
}
