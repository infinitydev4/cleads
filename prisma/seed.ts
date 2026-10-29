import { PrismaClient, Role } from "@prisma/client"
import { hash } from "bcryptjs"

const prisma = new PrismaClient()

const themes = [
  {
    id: "neon-grid",
    name: "Grille Néon",
    description: "Un design futuriste avec des cartes néon et une disposition en grille asymétrique",
    type: "BLOG",
    colors: {
      primary: "#BFFF00",
      background: "#0A0A0A",
      card: "#1A1A1A",
      text: "#FFFFFF",
      muted: "#888888"
    },
    features: [
      "Grille asymétrique",
      "Effets néon",
      "Cartes avec bordures lumineuses",
      "Animations fluides",
      "Design futuriste"
    ],
    layout: "grid",
    isDefault: true
  },
  {
    id: "masonry-dark",
    name: "Masonry Sombre",
    description: "Une disposition en masonry avec des cartes minimalistes et élégantes",
    type: "BLOG",
    colors: {
      primary: "#BFFF00",
      background: "#111111",
      card: "#1E1E1E",
      text: "#FFFFFF",
      muted: "#666666"
    },
    features: [
      "Layout Masonry",
      "Cartes minimalistes",
      "Accent rose vif",
      "Espacement dynamique",
      "Design épuré"
    ],
    layout: "masonry",
    isDefault: false
  },
  {
    id: "split-sidebar",
    name: "Split Sidebar",
    description: "Un design avec une sidebar fixe et des cartes modernes",
    type: "BLOG",
    colors: {
      primary: "#BFFF00",
      background: "#000000",
      card: "#111111",
      text: "#FFFFFF",
      muted: "#777777"
    },
    features: [
      "Sidebar fixe",
      "Cartes avec dégradés",
      "Accent violet",
      "Navigation fluide",
      "Design moderne"
    ],
    layout: "split",
    isDefault: false
  },
  {
    id: "full-width",
    name: "Full Width",
    description: "Un design immersif avec des cartes en pleine largeur",
    type: "BLOG",
    colors: {
      primary: "#BFFF00",
      background: "#000000",
      card: "#111111",
      text: "#FFFFFF",
      muted: "#777777"
    },
    features: [
      "Cartes en pleine largeur",
      "Ratio 21:9",
      "Accent doré",
      "Design immersif",
      "Navigation fluide"
    ],
    layout: "full",
    isDefault: false
  }
]

// Articles de blog
const blogArticles = [
  {
    title: "Comment Créer une Landing Page qui Convertit en 2024",
    slug: "comment-creer-une-landing-page-qui-convertit-2024",
    excerpt: "Découvrez les meilleures pratiques et tendances actuelles pour créer des landing pages performantes qui génèrent des conversions.",
    content: `
# Comment Créer une Landing Page qui Convertit en 2024

Les landing pages sont la pierre angulaire de votre stratégie de conversion. Dans cet article, nous allons explorer les éléments essentiels qui font d'une landing page un véritable outil de conversion.

## 1. Une Proposition de Valeur Claire

Votre landing page doit communiquer immédiatement sa valeur ajoutée. Commencez par un headline percutant qui répond à la question "Pourquoi devrais-je m'intéresser à cette offre ?"

## 2. Design et UX Optimisés

- Utilisez un design épuré et moderne
- Assurez-vous d'une navigation intuitive
- Optimisez pour le mobile
- Intégrez des éléments visuels pertinents

## 3. Call-to-Action (CTA) Efficaces

Vos CTA doivent être :
- Visibles et attractifs
- Contextuels
- Incitatifs
- Faciles à repérer

## 4. Preuves Sociales et Témoignages

Intégrez des éléments de confiance :
- Témoignages clients
- Logos de marques partenaires
- Statistiques et chiffres clés
- Certifications et badges

## 5. Optimisation SEO

Optimisez votre landing page pour les moteurs de recherche :
- Utilisez des mots-clés pertinents
- Structurez votre contenu avec des balises HTML appropriées
- Optimisez les images
- Assurez-vous d'une vitesse de chargement optimale

## Conclusion

Une landing page performante combine design, contenu et optimisation technique. Suivez ces principes pour créer des pages qui convertissent efficacement.
    `,
    coverImage: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?ixlib=rb-1.2.1&auto=format&fit=crop&w=1500&q=80",
    status: "PUBLISHED",
    publishedAt: new Date(),
    category: {
      name: "Marketing Digital",
      slug: "marketing-digital"
    },
    tags: [
      { name: "Landing Page", slug: "landing-page" },
      { name: "Conversion", slug: "conversion" },
      { name: "UX", slug: "ux" },
      { name: "Design", slug: "design" }
    ],
    views: 1250
  },
  {
    title: "Les 10 Meilleures Pratiques pour Optimiser votre Tunnel de Vente",
    slug: "meilleures-pratiques-tunnel-vente",
    excerpt: "Apprenez à construire un tunnel de vente efficace qui guide vos prospects vers la conversion tout en maximisant votre ROI.",
    content: `
# Les 10 Meilleures Pratiques pour Optimiser votre Tunnel de Vente

Un tunnel de vente bien structuré est la clé du succès en marketing digital. Voici les meilleures pratiques pour optimiser le vôtre.

## 1. Définir vos Personas

Avant de construire votre tunnel, identifiez précisément vos cibles :
- Créez des personas détaillés
- Comprenez leurs besoins et objections
- Adaptez votre message à chaque étape

## 2. Structurez vos Étapes

Un tunnel efficace comprend :
- Une phase d'attraction
- Une phase d'engagement
- Une phase de conversion
- Une phase de fidélisation

## 3. Contenu de Qualité

Produisez du contenu qui :
- Répond aux questions de vos prospects
- Apporte une valeur réelle
- Est adapté à chaque étape du tunnel

## 4. Automatisation Intelligente

Utilisez l'automatisation pour :
- Personnaliser les communications
- Suivre le comportement des prospects
- Optimiser les moments d'intervention

## 5. Mesure et Optimisation

Suivez les KPIs essentiels :
- Taux de conversion
- Taux d'abandon
- ROI par étape
- Coût d'acquisition client

## Conclusion

Un tunnel de vente optimisé est un processus continu d'amélioration. Mesurez, testez et optimisez régulièrement pour maximiser vos résultats.
    `,
    coverImage: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-1.2.1&auto=format&fit=crop&w=1500&q=80",
    status: "PUBLISHED",
    publishedAt: new Date(),
    category: {
      name: "Vente",
      slug: "vente"
    },
    tags: [
      { name: "Tunnel de Vente", slug: "tunnel-de-vente" },
      { name: "Conversion", slug: "conversion" },
      { name: "Marketing", slug: "marketing" },
      { name: "Automation", slug: "automation" }
    ],
    views: 980
  },
  {
    title: "SEO 2024 : Les Tendances à Ne Pas Manquer",
    slug: "seo-tendances-2024",
    excerpt: "Découvrez les dernières tendances SEO pour 2024 et apprenez à optimiser votre site pour les moteurs de recherche.",
    content: `
# SEO 2024 : Les Tendances à Ne Pas Manquer

Le SEO évolue constamment. Voici les tendances majeures à suivre en 2024 pour maintenir votre visibilité sur les moteurs de recherche.

## 1. L'Intelligence Artificielle dans le SEO

L'IA transforme le SEO :
- Contenu généré par l'IA
- Analyse prédictive
- Personnalisation avancée

## 2. Expérience Utilisateur (UX)

Google privilégie l'UX :
- Core Web Vitals
- Mobile-first
- Temps de chargement
- Navigation intuitive

## 3. Contenu E-E-A-T

Focus sur :
- Expertise
- Expérience
- Autorité
- Fiabilité

## 4. Recherche Vocale

Optimisez pour la recherche vocale :
- Questions conversationnelles
- Réponses directes
- Featured snippets

## 5. SEO Local Avancé

Améliorez votre visibilité locale :
- Google Business Profile
- Citations cohérentes
- Avis clients
- Contenu local

## Conclusion

Le SEO en 2024 est plus que jamais centré sur l'expérience utilisateur et la qualité du contenu. Adaptez votre stratégie à ces tendances pour maintenir votre visibilité.
    `,
    coverImage: "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?ixlib=rb-1.2.1&auto=format&fit=crop&w=1500&q=80",
    status: "PUBLISHED",
    publishedAt: new Date(),
    category: {
      name: "SEO",
      slug: "seo"
    },
    tags: [
      { name: "SEO", slug: "seo" },
      { name: "Optimisation", slug: "optimisation" },
      { name: "Marketing Digital", slug: "marketing-digital" },
      { name: "Contenu", slug: "contenu" }
    ],
    views: 850
  }
]

async function main() {
  try {
    console.log("Début du nettoyage de la base de données...")
    
    // Suppression des données existantes dans l'ordre pour respecter les contraintes de clé étrangère
    await prisma.article.deleteMany()
    await prisma.tag.deleteMany()
    await prisma.category.deleteMany()
    await prisma.theme.deleteMany()
    await prisma.user.deleteMany()

    console.log("Base de données nettoyée.")
    console.log("Début du seeding...")

    // Hash du mot de passe admin
    const hashedPassword = await hash("O81glQDVsOPp", 12)
    
    console.log("Password hash généré:", hashedPassword)

    // Création de l'administrateur
    const admin = await prisma.user.create({
      data: {
        name: "Administrateur",
        email: "admin@cleads.fr",
        password: hashedPassword,
        role: Role.ADMIN,
        language: "fr",
        isTemporaryPassword: false
      }
    })

    console.log("Admin créé:", {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      hashedPassword: admin.password?.substring(0, 10) + "..."
    })

    // Création des thèmes
    for (const theme of themes) {
      await prisma.theme.create({
        data: theme
      })
    }

    // Création des articles
    for (const article of blogArticles) {
      const { category, tags, ...articleData } = article
      
      // Création de la catégorie
      const createdCategory = await prisma.category.create({
        data: category
      })

      // Création ou récupération des tags existants
      const createdTags = await Promise.all(
        tags.map(tag => 
          prisma.tag.upsert({
            where: { slug: tag.slug },
            update: {},
            create: tag
          })
        )
      )

      // Création de l'article
      const createdArticle = await prisma.article.create({
        data: {
          ...articleData,
          userId: admin.id,
          categoryId: createdCategory.id,
          themeId: "neon-grid",
          tags: {
            connect: createdTags.map(tag => ({ id: tag.id }))
          }
        }
      })
      
      console.log(`Article créé : ${createdArticle.title}`)
    }

    console.log("Seeding terminé avec succès!")
  } catch (error) {
    console.error("Erreur pendant le seeding:", error)
    throw error
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  }) 