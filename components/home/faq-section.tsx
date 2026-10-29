"use client"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

const faqItems = [
  {
    id: "item-1",
    badge: "Délai",
    question: "Combien de temps faut-il pour créer une landing page ?",
    answer: "Nous livrons votre landing page en 72 heures après notre appel de consultation initial et la validation du brief."
  },
  {
    id: "item-2",
    badge: "Révisions",
    question: "Est-ce que je peux demander des modifications après livraison ?",
    answer: "Oui, tous nos forfaits incluent une série de révisions pour s'assurer que la landing page correspond parfaitement à vos attentes."
  },
  {
    id: "item-3",
    badge: "Tech",
    question: "Sur quelles plateformes construisez-vous les landing pages ?",
    answer: "Nous travaillons principalement avec Webflow, WordPress et Shopify, mais nous pouvons nous adapter à votre plateforme préférée."
  },
  {
    id: "item-4",
    badge: "Analytics",
    question: "Comment mesurez-vous l'efficacité des landing pages ?",
    answer: "Nous mettons en place des outils d'analyse pour suivre les taux de conversion, le temps passé sur la page, et d'autres métriques clés. Nous fournissons un rapport détaillé après le lancement."
  },
  {
    id: "item-5",
    badge: "Support",
    question: "Proposez-vous des services de maintenance ?",
    answer: "Oui, nous proposons des forfaits de maintenance mensuelle qui incluent des mises à jour de contenu, des optimisations continues et des tests A/B pour améliorer constamment les performances."
  }
]

export function FaqSection() {
  return (
    <section className="py-16 md:py-24">
      <div className="container px-4">
        <h2 className="mb-12 text-center text-3xl font-bold tracking-tight md:text-5xl">
          QUESTIONS FRÉQUENTES
        </h2>

        <div className="mx-auto max-w-3xl">
          <Accordion type="single" collapsible className="w-full space-y-6">
            {faqItems.map((item) => (
              <AccordionItem 
                key={item.id} 
                value={item.id} 
                className="relative rounded-2xl border-2 border-[#BFFF00] bg-black p-2 
                  shadow-[4px_4px_0px_0px_#BFFF00] transition-all duration-200
                  data-[state=open]:shadow-none data-[state=open]:translate-x-[4px] data-[state=open]:translate-y-[4px]"
              >
                <div className="absolute -top-3 -left-3 rounded-lg bg-[#BFFF00] px-3 py-1">
                  <span className="text-xs font-bold text-black">{item.badge}</span>
                </div>

                <AccordionTrigger className="text-left text-lg font-medium [&>svg]:text-[#BFFF00]">
                  {item.question}
                </AccordionTrigger>

                <AccordionContent className="text-gray-300 pt-4">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
} 