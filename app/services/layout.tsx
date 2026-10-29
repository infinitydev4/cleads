import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Nos Services | Cleads - Landing Pages Haute Performance",
  description: "Découvrez nos services de création de landing pages optimisées pour la conversion : SaaS, E-commerce, B2B, Développement Web, SEO et Performance.",
  openGraph: {
    title: "Nos Services | Cleads - Landing Pages Haute Performance",
    description: "Découvrez nos services de création de landing pages optimisées pour la conversion : SaaS, E-commerce, B2B, Développement Web, SEO et Performance.",
    images: ["/images/services-hero.jpg"],
  }
}

export default function ServicesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
} 