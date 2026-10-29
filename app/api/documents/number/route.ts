import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/options"
import { DocumentType } from "@prisma/client"
import { format } from "date-fns"

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type") as DocumentType
    const yearMonth = format(new Date(), "yyyyMM")

    if (!type) {
      return NextResponse.json({ error: "Type de document requis" }, { status: 400 })
    }

    // Récupérer le dernier numéro de document pour le mois en cours
    const lastDocument = await prisma.document.findFirst({
      where: {
        userId: session.user.id,
        type,
        number: {
          startsWith: `${type === DocumentType.INVOICE ? 'FACT' : 'DEVIS'}-${yearMonth}`
        }
      },
      orderBy: {
        number: 'desc'
      }
    })

    let nextNumber = 1
    if (lastDocument) {
      const lastNumberStr = lastDocument.number.split('-')[2]
      nextNumber = parseInt(lastNumberStr) + 1
    }

    // Formater le numéro avec des zéros devant
    const numberStr = nextNumber.toString().padStart(3, '0')
    const documentNumber = `${type === DocumentType.INVOICE ? 'FACT' : 'DEVIS'}-${yearMonth}-${numberStr}`

    return NextResponse.json({ number: documentNumber })
  } catch (error) {
    console.error("Erreur lors de la generation du numero:", error)
    return NextResponse.json(
      { error: "Erreur lors de la generation du numero" },
      { status: 500 }
    )
  }
} 