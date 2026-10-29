import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/options";
import { prisma } from "@/lib/prisma";

// Récupérer toutes les planifications
export async function GET() {
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupération des planifications de l'utilisateur
    const schedules = await prisma.articleSchedule.findMany({
      where: {
        user: {
          email: session.user.email
        }
      },
      orderBy: {
        nextRunDate: "asc"
      }
    });

    return NextResponse.json(schedules);
  } catch (error: any) {
    console.error("Erreur lors de la récupération des planifications:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la récupération des planifications" },
      { status: 500 }
    );
  }
}

// Créer une nouvelle planification
export async function POST(request: Request) {
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupération de l'utilisateur
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    // Récupération du corps de la requête
    const body = await request.json();
    
    // Validation
    const { name, frequency, categories } = body;
    
    if (!name || !frequency || !categories || !Array.isArray(categories) || categories.length === 0) {
      return NextResponse.json({ 
        error: "Nom, fréquence et au moins une catégorie sont requis" 
      }, { status: 400 });
    }
    
    // Calcul de la prochaine date d'exécution
    const nextRunDate = calculateNextRunDate(frequency);
    
    // Création de la planification
    const schedule = await prisma.articleSchedule.create({
      data: {
        name,
        userId: user.id,
        frequency: frequency,
        categories,
        keywords: body.keywords || [],
        textProvider: body.provider,
        openaiModel: body.openaiModel,
        huggingFaceModel: body.huggingFaceModel,
        category: body.newsCategory,
        newsQuery: body.newsQuery,
        tone: body.tone || "professionnel",
        language: body.language || "français",
        publishImmediately: body.publishImmediately || false,
        maxArticlesPerMonth: body.maxArticlesPerMonth || getDefaultArticlesPerMonth(frequency),
        nextRunDate
      }
    });

    return NextResponse.json(schedule);
  } catch (error: any) {
    console.error("Erreur lors de la création de la planification:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la création de la planification" },
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

// Obtenir le nombre maximum d'articles par mois en fonction de la fréquence
function getDefaultArticlesPerMonth(frequency: string): number {
  switch (frequency) {
    case "DAILY":
      return 30;
    case "WEEKLY":
      return 4;
    case "BIWEEKLY":
      return 2;
    case "MONTHLY":
      return 1;
    default:
      return 4; // Par défaut: hebdomadaire (4 par mois)
  }
} 