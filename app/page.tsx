import type { Metadata } from "next";
import { HomeExperience } from "@/components/home-v2/home-experience";

export const metadata: Metadata = {
  title: "Cleads — Acquisition B2B externalisée et agents IA",
  description:
    "Transformez votre prospection en opportunités commerciales. Une équipe dédiée, une acquisition multicanale et des agents IA sur mesure. Demandez votre audit gratuit.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Cleads — Activez votre acquisition B2B",
    description:
      "Les bons prospects. Les bons échanges. Une équipe et des agents IA pour faire avancer votre croissance.",
    type: "website",
    locale: "fr_FR",
    images: [
      {
        url: "/images/home/hero.webp",
        alt: "L’équipe d’acquisition Cleads dans son univers 3D",
      },
    ],
  },
};

export default function Home() {
  return <HomeExperience />;
}
