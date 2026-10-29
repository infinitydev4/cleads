import { NextResponse } from "next/server"
import { pusher } from "@/lib/pusher"
import { getSession } from "@/lib/auth/session"

export async function POST(request: Request) {
  const session = await getSession()
  
  if (!session?.user?.email) {
    return new NextResponse("Non autorisé", { status: 401 })
  }

  try {
    const formData = await request.formData()
    const socketId = formData.get("socket_id") as string
    const channelName = formData.get("channel_name") as string

    if (!socketId || !channelName) {
      return new NextResponse("Données manquantes", { status: 400 })
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