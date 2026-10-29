import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/options"
import { prisma } from "@/lib/prisma"
import { DocumentType } from "@prisma/client"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions)
    console.log("Session:", session)
    
    if (!session?.user) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    // Récupérer les paramètres de recherche
    const { searchParams } = new URL(request.url)
    const typeParam = searchParams.get("type")
    const type = typeParam as DocumentType | undefined

    // Récupérer tous les documents (factures et devis)
    const documents = await prisma.document.findMany({
      where: {
        userId: session.user.id,
        ...(type && { type }),
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        company: {
          include: {
            rib: true,
          }
        },
        items: true,
      },
    })

    console.log("Documents trouvés:", documents)

    // Formater les documents pour le front-end
    const formattedDocuments = documents.map(doc => ({
      id: doc.id,
      type: doc.type,
      number: doc.number,
      date: doc.date.toISOString(),
      dueDate: doc.dueDate?.toISOString(),
      client: doc.clientName,
      amount: doc.total,
      status: doc.status,
      items: doc.items.map(item => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        details: item.details,
      })),
      company: doc.company ? {
        id: doc.company.id,
        name: doc.company.name,
        address: doc.company.address,
        city: doc.company.city,
        email: doc.company.email,
        phone: doc.company.phone,
        siret: doc.company.siret,
        tva: doc.company.tva,
        website: doc.company.website,
        rib: doc.company.rib,
      } : null,
      subtotal: doc.subtotal,
      taxType: doc.taxType,
      taxValue: doc.taxValue,
      tax: doc.tax,
      total: doc.total,
      notes: doc.notes,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    }))

    console.log("Documents formatés:", formattedDocuments)

    return NextResponse.json(formattedDocuments)
  } catch (error) {
    console.error("[DOCUMENTS_GET]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 