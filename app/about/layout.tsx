import type { Metadata, Viewport } from "next"

export const metadata: Metadata = {
  title: "À propos de Cleads | Experts en Landing Pages Performantes",
  description: "Découvrez l'équipe Cleads, experts en création de landing pages à haute performance. Plus de 200 projets livrés et 30% de taux de conversion moyen.",
  openGraph: {
    title: "À propos de Cleads | Experts en Landing Pages Performantes",
    description: "Découvrez l'équipe Cleads, experts en création de landing pages à haute performance. Plus de 200 projets livrés et 30% de taux de conversion moyen.",
    images: ["/images/team-hero.jpg"],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
}

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="overflow-x-hidden">
      {children}
    </div>
  )
} 