import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const body = await req.json()
    const { date, isAvailable, reason } = body

    const exception = await prisma.exception.upsert({
      where: {
        userId_date: {
          userId: session.user.id,
          date: new Date(date),
        },
      },
      update: {
        isAvailable,
        reason,
      },
      create: {
        userId: session.user.id,
        date: new Date(date),
        isAvailable,
        reason,
      },
    })

    return NextResponse.json(exception)
  } catch (error) {
    console.error("[EXCEPTIONS_POST]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const where = {
      userId: session.user.id,
      ...(startDate && endDate && {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }),
    }

    const exceptions = await prisma.exception.findMany({
      where,
      orderBy: {
        date: "asc",
      },
    })

    return NextResponse.json(exceptions)
  } catch (error) {
    console.error("[EXCEPTIONS_GET]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const date = searchParams.get("date")

    if (!date) {
      return new NextResponse("Date manquante", { status: 400 })
    }

    await prisma.exception.delete({
      where: {
        userId_date: {
          userId: session.user.id,
          date: new Date(date),
        },
      },
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error("[EXCEPTIONS_DELETE]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 