"use client"

import { HeroSection } from "@/components/about/hero-section"
import { ValuesSection } from "@/components/about/values-section"
import { PageSpeedSection } from "@/components/about/pagespeed-section"
import { AdvantagesSection } from "@/components/about/advantages-section"
import { CTASection } from "@/components/about/cta-section"

export default function AboutPage() {
  return (
    <main className="bg-black text-white overflow-x-hidden min-h-screen">
      <HeroSection />
      <ValuesSection />
      <PageSpeedSection />
      <AdvantagesSection />
      <CTASection />
    </main>
  )
}

