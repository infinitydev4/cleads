import { NextResponse } from "next/server"
import { pusher } from "@/lib/pusher"
import { getSession } from "@/lib/auth/session"
import { canSubscribe } from "@/lib/ai/realtime"

/** Authorizes a private channel, and only the member's own: notifications and AI runs are personal. */
export async function POST(request: Request) {
  const session = await getSession()

  if (!session?.user?.id) {
    return new NextResponse("Non autorisé", { status: 401 })
  }

  try {
    const formData = await request.formData()
    const socketId = formData.get("socket_id") as string
    const channelName = formData.get("channel_name") as string

    if (!socketId || !channelName) {
      return new NextResponse("Données manquantes", { status: 400 })
    }
    if (!canSubscribe(session.user.id, channelName)) {
      return new NextResponse("Accès refusé", { status: 403 })
    }

    const authResponse = pusher.authorizeChannel(socketId, channelName, {
      user_id: session.user.id,
    })

    return NextResponse.json(authResponse)
  } catch (error) {
    console.error("[PUSHER_AUTH]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
}
