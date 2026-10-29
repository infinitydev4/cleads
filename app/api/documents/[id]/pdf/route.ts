import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/options"
import { prisma } from "@/lib/prisma"
import { renderToBuffer, Document } from "@react-pdf/renderer"
import { InvoicePDF } from "@/components/documents/InvoicePDF"
import { QuotePDF } from "@/components/documents/QuotePDF"
import { DocumentType } from "@prisma/client"
import React from "react"

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    // Récupérer le document avec les items et l'entreprise
    const document = await prisma.document.findUnique({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      include: {
        company: true,
        items: true,
      },
    })

    if (!document) {
      return new NextResponse("Document non trouvé", { status: 404 })
    }

    // Calculer les totaux
    const subtotal = document.items.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0
    )
    const tax = (subtotal * Number(document.taxValue)) / 100
    const total = subtotal + tax

    // Préparer les données pour le PDF
    const documentData = {
      ...document,
      items: document.items,
      subtotal,
      tax,
      total,
    }

    // Générer le PDF
    const buffer = await renderToBuffer(
      React.createElement(Document, {}, 
        document.type === DocumentType.INVOICE
          ? React.createElement(InvoicePDF, {
              invoice: documentData,
              company: document.company,
            })
          : React.createElement(QuotePDF, {
              quote: documentData,
              company: document.company,
            })
      )
    )

    // Retourner le PDF avec les bons headers
    const response = new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${document.number}.pdf"`,
      },
    })

    return response
  } catch (error) {
    console.error("Erreur lors de la génération du PDF:", error)
    return new NextResponse("Erreur lors de la génération du PDF", { status: 500 })
  }
} 