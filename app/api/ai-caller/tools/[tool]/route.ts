import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { LeadError } from "@/features/leads/errors"
import { toolBook, toolCallback, toolDoNotCall, toolSlots } from "@/features/ai-caller/service"
import { bookToolSchema, callbackToolSchema, slotsToolSchema } from "@/features/ai-caller/schemas"

export const dynamic = "force-dynamic"

/**
 * The agent's tools (E33), called by ElevenLabs during a call. No session: the call's own token, sent by ElevenLabs
 * from the call's dynamic variables, names the one call it may act on, and only while that call is under way. The
 * answer is read by the agent, so errors are sentences it can say.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params
  try {
    const body = await request.json()
    switch (tool) {
      case "slots":
        return NextResponse.json(await toolSlots(slotsToolSchema.parse(body).call_token))
      case "book": {
        const b = bookToolSchema.parse(body)
        return NextResponse.json(await toolBook(b.call_token, b))
      }
      case "callback": {
        const b = callbackToolSchema.parse(body)
        return NextResponse.json(await toolCallback(b.call_token, b))
      }
      case "do-not-call":
        return NextResponse.json(await toolDoNotCall(slotsToolSchema.parse(body).call_token))
      default:
        return NextResponse.json({ error: "Outil inconnu" }, { status: 404 })
    }
  } catch (error) {
    if (error instanceof LeadError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Demande incomplète." }, { status: 400 })
    console.error("[AI_CALLER_TOOL]", tool, error)
    return NextResponse.json({ error: "Problème technique : propose un rappel au prospect." }, { status: 500 })
  }
}
