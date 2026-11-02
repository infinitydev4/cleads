export const dynamic = "force-dynamic"

/**
 * TEMPORARY, E24 prerequisite: how long may a Netlify function stream? Answers only on a deploy preview's own address
 * (never on cleads.fr), streams one line per second for `?s=` seconds (900 at most) and says when it ends. To be removed
 * once measured, before the merge.
 */
export async function GET(request: Request) {
  const host = request.headers.get("host") ?? ""
  if (!/^deploy-preview-\d+--[a-z0-9-]+\.netlify\.app$/.test(host)) return new Response("Not found", { status: 404 })
  const seconds = Math.min(Math.max(Math.floor(Number(new URL(request.url).searchParams.get("s"))) || 30, 1), 900)
  const started = Date.now()
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`début, ${seconds} s demandées\n`))
      for (let i = 1; i <= seconds; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1_000))
        controller.enqueue(encoder.encode(`${i} s\n`))
      }
      controller.enqueue(encoder.encode(`fin après ${Math.round((Date.now() - started) / 1_000)} s\n`))
      controller.close()
    },
  })
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } })
}
