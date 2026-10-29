import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/options";
import { prisma } from "@/lib/prisma";

// Mettre en pause une planification
export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params;

    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Vérification de l'accès
    const existingSchedule = await prisma.articleSchedule.findFirst({
      where: {
        id,
        user: {
          email: session.user.email
        }
      }
    });

    if (!existingSchedule) {
      return NextResponse.json({ error: "Planification non trouvée" }, { status: 404 });
    }

    // Mise en pause de la planification
    const updatedSchedule = await prisma.articleSchedule.update({
      where: { id },
      data: {
        status: "PAUSED"
      }
    });

    return NextResponse.json(updatedSchedule);
  } catch (error: any) {
    console.error("Erreur lors de la mise en pause de la planification:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la mise en pause de la planification" },
      { status: 500 }
    );
  }
} 