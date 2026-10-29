import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const body = await req.json()
    const { startTime, endTime, isActive } = body

    const breakTime = await prisma.breakTime.upsert({
      where: {
        userId: session.user.id,
      },
      update: {
        startTime,
        endTime,
        isActive,
      },
      create: {
        userId: session.user.id,
        startTime,
        endTime,
        isActive,
      },
    })

    return NextResponse.json(breakTime)
  } catch (error) {
    console.error("[BREAK_TIME_POST]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const breakTime = await prisma.breakTime.findUnique({
      where: {
        userId: session.user.id,
      },
    })

    return NextResponse.json(breakTime)
  } catch (error) {
    console.error("[BREAK_TIME_GET]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 