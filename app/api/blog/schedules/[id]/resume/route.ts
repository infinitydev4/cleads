import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/options";
import { prisma } from "@/lib/prisma";

// Réactiver une planification
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

    // Calcul de la prochaine date d'exécution
    const nextRunDate = calculateNextRunDate(existingSchedule.frequency);

    // Réactivation de la planification
    const updatedSchedule = await prisma.articleSchedule.update({
      where: { id },
      data: {
        status: "ACTIVE",
        nextRunDate
      }
    });

    return NextResponse.json(updatedSchedule);
  } catch (error: any) {
    console.error("Erreur lors de la réactivation de la planification:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la réactivation de la planification" },
      { status: 500 }
    );
  }
}

// Calculer la date de prochaine exécution en fonction de la fréquence
function calculateNextRunDate(frequency: string): Date {
  const now = new Date();
  const nextRun = new Date(now);
  
  // Heure d'exécution: 7h du matin
  nextRun.setHours(7, 0, 0, 0);
  
  // Si la date calculée est dans le passé, ajouter l'intervalle approprié
  if (nextRun <= now) {
    switch (frequency) {
      case "DAILY":
        nextRun.setDate(nextRun.getDate() + 1);
        break;
      case "WEEKLY":
        nextRun.setDate(nextRun.getDate() + 7);
        break;
      case "BIWEEKLY":
        nextRun.setDate(nextRun.getDate() + 14);
        break;
      case "MONTHLY":
        nextRun.setMonth(nextRun.getMonth() + 1);
        break;
      default:
        nextRun.setDate(nextRun.getDate() + 7); // Par défaut: hebdomadaire
    }
  }
  
  return nextRun;
} 