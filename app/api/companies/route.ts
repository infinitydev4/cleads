import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/options"

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 })
    }

    const body = await req.json()
    const {
      name,
      address,
      city,
      email,
      phone,
      siret,
      tva,
      website,
      rib
    } = body

    const company = await prisma.company.create({
      data: {
        name,
        address,
        city,
        email,
        phone,
        siret,
        tva,
        website,
        userId: session.user.id,
        rib: rib ? {
          create: {
            bank: rib.bank,
            iban: rib.iban,
            bic: rib.bic
          }
        } : undefined
      },
      include: {
        rib: true
      }
    })

    return NextResponse.json(company)
  } catch (error) {
    console.error("Erreur lors de la creation de l'entreprise:", error)
    return NextResponse.json(
      { error: "Erreur lors de la creation de l'entreprise" },
      { status: 500 }
    )
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 })
    }

    const companies = await prisma.company.findMany({
      where: {
        userId: session.user.id
      },
      include: {
        rib: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json(companies)
  } catch (error) {
    console.error("Erreur lors de la recuperation des entreprises:", error)
    return NextResponse.json(
      { error: "Erreur lors de la recuperation des entreprises" },
      { status: 500 }
    )
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 })
    }

    const body = await req.json()
    const {
      id,
      name,
      address,
      city,
      email,
      phone,
      siret,
      tva,
      website,
      rib
    } = body

    const company = await prisma.company.update({
      where: {
        id,
        userId: session.user.id
      },
      data: {
        name,
        address,
        city,
        email,
        phone,
        siret,
        tva,
        website,
        rib: rib ? {
          upsert: {
            create: {
              bank: rib.bank,
              iban: rib.iban,
              bic: rib.bic
            },
            update: {
              bank: rib.bank,
              iban: rib.iban,
              bic: rib.bic
            }
          }
        } : undefined
      },
      include: {
        rib: true
      }
    })

    return NextResponse.json(company)
  } catch (error) {
    console.error("Erreur lors de la mise a jour de l'entreprise:", error)
    return NextResponse.json(
      { error: "Erreur lors de la mise a jour de l'entreprise" },
      { status: 500 }
    )
  }
} 