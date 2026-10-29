import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Role } from "@prisma/client"
import { hash } from "bcryptjs"

export async function POST() {
  try {
    const hashedPassword = await hash("password123", 12)
    
    const user = await prisma.user.create({
      data: {
        name: "Client Test",
        email: "client@test.com",
        password: hashedPassword,
        role: Role.USER
      }
    })

    return NextResponse.json({ message: "Utilisateur test créé avec succès", user })
  } catch (error) {
    console.error("Erreur lors de la création de l'utilisateur test:", error)
    return NextResponse.json(
      { error: "Erreur lors de la création de l'utilisateur test" },
      { status: 500 }
    )
  }
} 