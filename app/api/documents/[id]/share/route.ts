import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/options"
import { prisma } from "@/lib/prisma"
import { uploadToS3 } from "@/lib/s3"
import { renderToBuffer, Document } from "@react-pdf/renderer"
import { InvoicePDF } from "@/components/documents/InvoicePDF"
import { QuotePDF } from "@/components/documents/QuotePDF"
import { DocumentType } from "@prisma/client"
import React from "react"

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
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

    // Uploader le PDF sur S3
    const key = `documents/${document.id}/${document.number}.pdf`
    const url = await uploadToS3(buffer, key, "application/pdf")

    // Créer une notification pour l'admin
    const admin = await prisma.user.findFirst({
      where: {
        role: "ADMIN",
      },
    })

    if (admin) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: "document",
          title: "Nouveau document partagé",
          message: `${document.type === DocumentType.INVOICE ? "Facture" : "Devis"} ${document.number} partagé par ${session.user.name || "un client"}`,
        },
      })
    }

    return NextResponse.json({ url })
  } catch (error) {
    console.error("[DOCUMENT_SHARE]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 