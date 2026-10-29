import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/options"
import { prisma } from "@/lib/prisma"
import { renderToBuffer, Document } from "@react-pdf/renderer"
import { InvoicePDF } from "@/components/documents/InvoicePDF"
import { QuotePDF } from "@/components/documents/QuotePDF"
import { Resend } from "resend"
import { DocumentStatus, DocumentType } from "@prisma/client"
import { EmailTemplate } from "@/components/emails/EmailTemplate"
import React from "react"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    // Récupérer le document
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
    const pdfBuffer = await renderToBuffer(
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

    // Envoyer l'email avec le PDF
    const { data, error } = await resend.emails.send({
      from: `${document.company?.name} <${process.env.RESEND_FROM_EMAIL}>`,
      to: [document.clientEmail],
      subject: `${document.type === "INVOICE" ? "Facture" : "Devis"} ${document.number}`,
      react: EmailTemplate({
        documentType: document.type,
        documentNumber: document.number,
        companyName: document.company?.name || "",
      }),
      attachments: [
        {
          filename: `${document.number}.pdf`,
          content: pdfBuffer,
        },
      ],
    })

    if (error) {
      console.error("[EMAIL_SEND_ERROR]", error)
      return new NextResponse("Erreur lors de l'envoi de l'email", { status: 500 })
    }

    // Mettre à jour le statut du document
    await prisma.document.update({
      where: {
        id: params.id,
      },
      data: {
        status: DocumentStatus.SENT,
      },
    })

    return new NextResponse(JSON.stringify({ message: "Email envoyé avec succès" }), {
      status: 200,
    })
  } catch (error) {
    console.error("[DOCUMENT_SEND]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 