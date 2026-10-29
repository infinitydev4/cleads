import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/options"
import { DocumentType, DocumentStatus } from "@prisma/client"

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 })
    }

    const body = await req.json()
    const {
      number,
      clientName,
      clientEmail,
      clientPhone,
      clientAddress,
      clientCity,
      items,
      taxType,
      taxValue,
      notes,
      companyId
    } = body

    // Calculer les totaux
    const subtotal = items.reduce((sum: number, item: any) => sum + (item.quantity * item.price), 0)
    const tax = subtotal * (taxValue / 100)
    const total = subtotal + tax

    // Créer le devis
    const quote = await prisma.document.create({
      data: {
        type: DocumentType.QUOTE,
        number,
        date: new Date(),
        status: DocumentStatus.DRAFT,
        clientName,
        clientEmail,
        clientPhone,
        clientAddress,
        clientCity,
        subtotal,
        taxType,
        taxValue,
        tax,
        total,
        notes,
        userId: session.user.id,
        companyId,
        items: {
          create: items.map((item: any) => ({
            description: item.description,
            quantity: item.quantity,
            price: item.price,
            total: item.quantity * item.price,
            details: item.details
          }))
        }
      },
      include: {
        items: true,
        company: true
      }
    })

    return NextResponse.json(quote)
  } catch (error) {
    console.error("Erreur lors de la creation du devis:", error)
    return NextResponse.json(
      { error: "Erreur lors de la creation du devis" },
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

    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")
    const companyId = searchParams.get("companyId")

    const where = {
      userId: session.user.id,
      type: DocumentType.QUOTE,
      ...(status && { status: status as DocumentStatus }),
      ...(companyId && { companyId })
    }

    const quotes = await prisma.document.findMany({
      where,
      include: {
        items: true,
        company: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json(quotes)
  } catch (error) {
    console.error("Erreur lors de la recuperation des devis:", error)
    return NextResponse.json(
      { error: "Erreur lors de la recuperation des devis" },
      { status: 500 }
    )
  }
} 