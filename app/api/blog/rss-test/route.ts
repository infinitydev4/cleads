import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/options";
import { checkRssFeedValidity } from "@/lib/config/rss-feeds";
import { RSS_FEEDS } from "@/lib/config/rss-feeds";

// Endpoint pour tester les flux RSS
export async function POST(req: Request) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupérer les données de la requête
    const { category, url, testAll } = await req.json();

    // Si un URL spécifique est fourni, tester uniquement cet URL
    if (url) {
      const isValid = await checkRssFeedValidity(url);
      return NextResponse.json({ 
        results: [{ url, valid: isValid }]
      });
    }

    // Si testAll est true, tester tous les flux RSS
    if (testAll) {
      const allFeeds = Object.values(RSS_FEEDS).flat();
      const results = await Promise.all(
        allFeeds.map(async (feed) => ({
          name: feed.name,
          url: feed.url,
          category: feed.category,
          valid: await checkRssFeedValidity(feed.url)
        }))
      );

      return NextResponse.json({ results });
    }

    // Si une catégorie est fournie, tester tous les flux de cette catégorie
    if (category && RSS_FEEDS[category]) {
      const feeds = RSS_FEEDS[category];
      const results = await Promise.all(
        feeds.map(async (feed) => ({
          name: feed.name,
          url: feed.url,
          category: feed.category,
          valid: await checkRssFeedValidity(feed.url)
        }))
      );

      return NextResponse.json({ results });
    }

    // Si aucune catégorie valide n'est fournie, retourner une erreur
    return NextResponse.json(
      { error: "Catégorie ou URL invalide" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Erreur lors du test des flux RSS:", error);
    return NextResponse.json(
      { error: "Erreur lors du test des flux RSS" },
      { status: 500 }
    );
  }
} 