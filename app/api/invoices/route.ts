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
      companyId,
      quoteId // ID du devis si la facture est créée à partir d'un devis
    } = body

    // Calculer les totaux
    const subtotal = items.reduce((sum: number, item: any) => sum + (item.quantity * item.price), 0)
    const tax = subtotal * (taxValue / 100)
    const total = subtotal + tax

    // Définir la date d'échéance (30 jours par défaut)
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 30)

    // Créer la facture
    const invoice = await prisma.document.create({
      data: {
        type: DocumentType.INVOICE,
        number,
        date: new Date(),
        dueDate,
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

    // Si la facture est créée à partir d'un devis, mettre à jour le statut du devis
    if (quoteId) {
      await prisma.document.update({
        where: {
          id: quoteId,
          userId: session.user.id
        },
        data: {
          status: DocumentStatus.ACCEPTED
        }
      })
    }

    return NextResponse.json(invoice)
  } catch (error) {
    console.error("Erreur lors de la creation de la facture:", error)
    return NextResponse.json(
      { error: "Erreur lors de la creation de la facture" },
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
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const where = {
      userId: session.user.id,
      type: DocumentType.INVOICE,
      ...(status && { status: status as DocumentStatus }),
      ...(companyId && { companyId }),
      ...(startDate && endDate && {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      })
    }

    const invoices = await prisma.document.findMany({
      where,
      include: {
        items: true,
        company: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json(invoices)
  } catch (error) {
    console.error("Erreur lors de la recuperation des factures:", error)
    return NextResponse.json(
      { error: "Erreur lors de la recuperation des factures" },
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
    const { id, status } = body

    const invoice = await prisma.document.update({
      where: {
        id,
        userId: session.user.id,
        type: DocumentType.INVOICE
      },
      data: {
        status: status as DocumentStatus
      },
      include: {
        items: true,
        company: true
      }
    })

    return NextResponse.json(invoice)
  } catch (error) {
    console.error("Erreur lors de la mise a jour de la facture:", error)
    return NextResponse.json(
      { error: "Erreur lors de la mise a jour de la facture" },
      { status: 500 }
    )
  }
} 