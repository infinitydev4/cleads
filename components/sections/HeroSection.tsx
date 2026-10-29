import { TrackedButton } from "@/components/tracking/TrackedButton"

export function HeroSection() {
  return (
    <div>
      <h1>Titre principal</h1>
      <p>Description...</p>
      
      <TrackedButton
        trackingName="hero_cta"
        location="home_hero"
        className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
      >
        Commencer maintenant
      </TrackedButton>
      
      <TrackedButton
        trackingName="hero_secondary"
        location="home_hero"
        variant="outline"
      >
        En savoir plus
      </TrackedButton>
    </div>
  )
} 