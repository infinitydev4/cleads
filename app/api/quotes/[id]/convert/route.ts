import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/options"
import { DocumentType, DocumentStatus } from "@prisma/client"
import { format } from "date-fns"

export const dynamic = 'force-dynamic'

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 })
    }

    // Récupérer le devis
    const quote = await prisma.document.findUnique({
      where: {
        id: params.id,
        userId: session.user.id,
        type: DocumentType.QUOTE
      },
      include: {
        items: true,
        company: true
      }
    })

    if (!quote) {
      return NextResponse.json({ error: "Devis non trouve" }, { status: 404 })
    }

    // Générer le numéro de facture
    const invoiceNumber = `FACT-${format(new Date(), "yyyyMM")}-001`

    // Définir la date d'échéance (30 jours par défaut)
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 30)

    // Créer la facture à partir du devis
    const invoice = await prisma.document.create({
      data: {
        type: DocumentType.INVOICE,
        number: invoiceNumber,
        date: new Date(),
        dueDate,
        status: DocumentStatus.DRAFT,
        clientName: quote.clientName,
        clientEmail: quote.clientEmail,
        clientPhone: quote.clientPhone,
        clientAddress: quote.clientAddress,
        clientCity: quote.clientCity,
        subtotal: quote.subtotal,
        taxType: quote.taxType,
        taxValue: quote.taxValue,
        tax: quote.tax,
        total: quote.total,
        notes: quote.notes,
        userId: session.user.id,
        companyId: quote.companyId,
        items: {
          create: quote.items.map(item => ({
            description: item.description,
            quantity: item.quantity,
            price: item.price,
            total: item.total,
            details: item.details
          }))
        }
      },
      include: {
        items: true,
        company: true
      }
    })

    // Mettre à jour le statut du devis
    await prisma.document.update({
      where: {
        id: params.id
      },
      data: {
        status: DocumentStatus.ACCEPTED
      }
    })

    return NextResponse.json(invoice)
  } catch (error) {
    console.error("Erreur lors de la conversion du devis:", error)
    return NextResponse.json(
      { error: "Erreur lors de la conversion du devis" },
      { status: 500 }
    )
  }
} 