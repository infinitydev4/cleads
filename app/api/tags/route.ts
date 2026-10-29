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

    const tags = await prisma.tag.findMany({
      orderBy: {
        name: "asc",
      },
    })

    return NextResponse.json(tags)
  } catch (error) {
    console.error("Erreur lors de la récupération des tags:", error)
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

    // Vérifier si le tag existe déjà
    const existingTag = await prisma.tag.findFirst({
      where: {
        OR: [
          { name: { equals: name, mode: "insensitive" } },
          { slug: { equals: slugify(name), mode: "insensitive" } },
        ],
      },
    })

    if (existingTag) {
      return NextResponse.json(existingTag)
    }

    const tag = await prisma.tag.create({
      data: {
        name,
        slug: slugify(name),
      },
    })

    return NextResponse.json(tag)
  } catch (error) {
    console.error("Erreur lors de la création du tag:", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 