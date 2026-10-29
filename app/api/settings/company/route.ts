import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"

export async function PATCH(req: Request) {
  try {
    const session = await getSession()
    if (!session?.user?.email) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const body = await req.json()
    const { name, email, phone, website, address, city, postalCode, country, siret, tva, iban, bic, bank } = body

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

    if (!company) {
      return new NextResponse("Entreprise non trouvée", { status: 404 })
    }

    // Mise à jour de l'entreprise
    const updatedCompany = await prisma.billingCompany.update({
      where: {
        id: company.id
      },
      data: {
        name,
        email,
        phone,
        website,
        address,
        city,
        postalCode,
        country,
        siret,
        tva,
      }
    })

    // Mise à jour du RIB uniquement si iban, bic et bank sont présents
    if (iban && bic && bank) {
      try {
        await prisma.rib.upsert({
          where: {
            companyId: company.id
          },
          update: {
            iban,
            bic,
            bank
          },
          create: {
            companyId: company.id,
            iban,
            bic,
            bank
          }
        })
      } catch (ribError) {
        console.error("[RIB_UPDATE]", ribError)
        // On continue même si la mise à jour du RIB échoue
      }
    }

    // Récupérer l'entreprise mise à jour avec son RIB
    const companyWithRib = await prisma.billingCompany.findUnique({
      where: {
        id: company.id
      },
      include: {
        rib: true
      }
    })

    return NextResponse.json({
      ...companyWithRib,
      iban: companyWithRib?.rib?.iban || "",
      bic: companyWithRib?.rib?.bic || "",
      bank: companyWithRib?.rib?.bank || ""
    })
  } catch (error) {
    console.error("[COMPANY_PATCH]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 