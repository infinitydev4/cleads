import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/options";
import { prisma } from "@/lib/prisma";

// Récupérer une planification spécifique
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params;

    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupération de la planification
    const schedule = await prisma.articleSchedule.findUnique({
      where: {
        id,
        user: {
          email: session.user.email
        }
      }
    });

    if (!schedule) {
      return NextResponse.json({ error: "Planification non trouvée" }, { status: 404 });
    }

    return NextResponse.json(schedule);
  } catch (error: any) {
    console.error("Erreur lors de la récupération de la planification:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la récupération de la planification" },
      { status: 500 }
    );
  }
}

// Mettre à jour une planification
export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params;

    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupération du corps de la requête
    const body = await request.json();

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

    // Mise à jour de la planification
    const updatedSchedule = await prisma.articleSchedule.update({
      where: { id },
      data: {
        name: body.name,
        frequency: body.frequency,
        categories: body.categories,
        keywords: body.keywords,
        textProvider: body.provider,
        openaiModel: body.openaiModel,
        huggingFaceModel: body.huggingFaceModel,
        category: body.newsCategory,
        newsQuery: body.newsQuery,
        tone: body.tone,
        language: body.language,
        publishImmediately: body.publishImmediately,
        maxArticlesPerMonth: body.maxArticlesPerMonth,
        // Recalculer la prochaine date si la fréquence change
        ...(body.frequency !== existingSchedule.frequency ? {
          nextRunDate: calculateNextRunDate(body.frequency)
        } : {})
      }
    });

    return NextResponse.json(updatedSchedule);
  } catch (error: any) {
    console.error("Erreur lors de la mise à jour de la planification:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la mise à jour de la planification" },
      { status: 500 }
    );
  }
}

// Supprimer une planification
export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupération de l'utilisateur
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    // Vérification de l'existence de la planification
    const schedule = await prisma.articleSchedule.findFirst({
      where: {
        id: params.id,
        userId: user.id
      }
    });

    if (!schedule) {
      return NextResponse.json({ error: "Planification non trouvée" }, { status: 404 });
    }

    // Suppression de la planification
    await prisma.articleSchedule.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Erreur lors de la suppression de la planification:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la suppression de la planification" },
      { status: 500 }
    );
  }
}

// Mise à jour d'une planification
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Vérification de l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupération du corps de la requête
    const body = await request.json();
    
    // Validation
    const { 
      name, 
      frequency, 
      categories,
      generateImage,
      imageProvider,
      imageModel
    } = body;
    
    if (!name || !frequency || !categories || !Array.isArray(categories) || categories.length === 0) {
      return NextResponse.json({ 
        error: "Nom, fréquence et au moins une catégorie sont requis" 
      }, { status: 400 });
    }

    // Vérification de l'existence de la planification
    const existingSchedule = await prisma.articleSchedule.findUnique({
      where: {
        id: params.id
      },
      include: {
        user: true
      }
    });

    if (!existingSchedule) {
      return NextResponse.json({ error: "Planification non trouvée" }, { status: 404 });
    }

    // Vérification que l'utilisateur est propriétaire de la planification
    if (existingSchedule.user.email !== session.user.email) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    // Mise à jour de la planification
    const updatedSchedule = await prisma.articleSchedule.update({
      where: {
        id: params.id
      },
      data: {
        name: body.name,
        frequency: body.frequency,
        categories: body.categories,
        keywords: body.keywords || [],
        textProvider: body.textProvider,
        openaiModel: body.openaiModel,
        huggingFaceModel: body.huggingFaceModel,
        category: body.newsCategory,
        newsQuery: body.newsQuery,
        tone: body.tone,
        language: body.language,
        publishImmediately: body.publishImmediately,
        maxArticlesPerMonth: body.maxArticlesPerMonth,
        generateImage: body.generateImage,
        imageProvider: body.imageProvider,
        imageModel: body.imageModel
      }
    });

    return NextResponse.json(updatedSchedule);
  } catch (error: any) {
    console.error("Erreur lors de la mise à jour:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de la mise à jour" },
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