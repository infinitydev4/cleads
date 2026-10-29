import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/options"
import { prisma } from "@/lib/prisma"
import { slugify } from "@/lib/utils"

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const categories = await prisma.category.findMany({
      orderBy: {
        name: "asc",
      },
    })

    return NextResponse.json(categories)
  } catch (error) {
    console.error("Erreur lors de la récupération des catégories:", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const { name } = await req.json()

    if (!name) {
      return new NextResponse("Le nom est requis", { status: 400 })
    }

    const category = await prisma.category.create({
      data: {
        name,
        slug: slugify(name),
      },
    })

    return NextResponse.json(category)
  } catch (error) {
    console.error("Erreur lors de la création de la catégorie:", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 