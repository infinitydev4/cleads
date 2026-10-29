import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../options"
import { prisma } from "@/lib/prisma"
import { compare, hash } from "bcryptjs"

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse("Non autorisé", { status: 401 })
    }

    const body = await request.json()
    const { currentPassword, newPassword } = body

    // Vérifier que les mots de passe sont fournis
    if (!currentPassword || !newPassword) {
      return new NextResponse(
        "Le mot de passe actuel et le nouveau mot de passe sont requis",
        { status: 400 }
      )
    }

    // Récupérer l'utilisateur
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    })

    if (!user || !user.password) {
      return new NextResponse("Utilisateur non trouvé", { status: 404 })
    }

    // Vérifier le mot de passe actuel
    const isPasswordValid = await compare(currentPassword, user.password)
    if (!isPasswordValid) {
      return new NextResponse("Mot de passe actuel incorrect", { status: 400 })
    }

    // Hasher le nouveau mot de passe
    const hashedPassword = await hash(newPassword, 12)

    // Mettre à jour le mot de passe et désactiver le flag isTemporaryPassword
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        password: hashedPassword,
        isTemporaryPassword: false
      }
    })

    return new NextResponse(JSON.stringify({ message: "Mot de passe mis à jour avec succès" }))
  } catch (error) {
    console.error("[CHANGE_PASSWORD_ERROR]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 