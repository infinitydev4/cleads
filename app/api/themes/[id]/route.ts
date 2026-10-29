import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/options"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const theme = await prisma.theme.findUnique({
      where: { id: params.id }
    })

    if (!theme) {
      return new NextResponse("Thème non trouvé", { status: 404 })
    }

    return NextResponse.json(theme)
  } catch (error) {
    console.error("[THEME_GET]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const body = await req.json()
    const { name, description, colors, features, layout } = body

    const theme = await prisma.theme.update({
      where: { id: params.id },
      data: {
        name,
        description,
        colors,
        features,
        layout
      }
    })

    return NextResponse.json(theme)
  } catch (error) {
    console.error("[THEME_UPDATE]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
}

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const theme = await prisma.theme.delete({
      where: { id: params.id }
    })

    return NextResponse.json(theme)
  } catch (error) {
    console.error("[THEME_DELETE]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 