import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user?.email) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: {
        email: session.user.email
      },
      include: {
        billingCompanies: {
          take: 1,
          include: {
            rib: true
          }
        }
      }
    })

    if (!user) {
      return new NextResponse("Utilisateur non trouvé", { status: 404 })
    }

    // On prend la première entreprise (Cleads)
    const company = user.billingCompanies[0]

    return NextResponse.json({
      admin: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        language: user.language,
        avatar: user.image
      },
      company: company ? {
        name: company.name,
        email: company.email,
        phone: company.phone,
        address: company.address,
        city: company.city,
        postalCode: company.postalCode,
        country: company.country,
        website: company.website,
        siret: company.siret,
        tva: company.tva,
        iban: company.rib?.iban || "",
        bic: company.rib?.bic || "",
        bank: company.rib?.bank || ""
      } : null
    })
  } catch (error) {
    console.error("[SETTINGS_GET]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 