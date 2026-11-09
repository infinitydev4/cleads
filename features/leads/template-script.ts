import type { CallScript, Objection } from "@/features/offer-pitch/schemas"
import type { LeadDetail, SiteState } from "./types"

/**
 * The free call script (9 November 2026): written once per situation, filled with the fiche's real facts (name, city,
 * trade, Google reviews, what stands for a site). No model: the volume stays free; the AI script stays one click away.
 */
export interface TemplateScript {
  script: CallScript
  objections: Objection[]
}

const SOCIAL: [RegExp, string][] = [[/facebook|fb\.com/i, "Facebook"], [/instagram/i, "Instagram"], [/pagesjaunes/i, "Pages Jaunes"], [/linktr\.ee/i, "Linktree"], [/linkedin/i, "LinkedIn"], [/tiktok/i, "TikTok"]]

export function templateScript(lead: Pick<LeadDetail, "company" | "contact">, site: SiteState): TemplateScript {
  const c = lead.company
  const k = lead.contact
  const trade = c?.sector?.toLowerCase() || "professionnel"
  const city = c?.city ?? "chez vous"
  const reviews = c?.rating != null && (c.reviewCount ?? 0) > 0 ? `${String(c.rating).replace(".", ",")} sur Google avec ${c.reviewCount} avis` : null
  const who = k?.name ? `Bonjour ${k.name}` : "Bonjour, je cherche à joindre le gérant"
  const page = SOCIAL.find(([re]) => re.test(c?.website ?? ""))?.[1] ?? "réseaux sociaux"
  const praise = reviews ? `J’ai vu que vous avez ${reviews} : vos clients vous apprécient.` : "Je regardais les entreprises de votre secteur."

  const hook =
    site === "none"
      ? `${praise} Mais quelqu’un qui cherche un ${trade} à ${city} sur Google ne trouve pas de site à votre nom : il appelle le suivant. Ça vous arrive de vous en rendre compte ?`
      : site === "social"
        ? `${praise} Vous avez une page ${page}, mais pas de site : sur Google, ce sont les entreprises avec un site qui sortent en premier sur « ${trade} ${city} ». Vous avez déjà regardé où vous apparaissez ?`
        : site === "weak"
          ? `${praise} J’ai regardé votre site sur téléphone : il est lent à s’afficher, et c’est là que la plupart de vos clients le consultent. Vous le saviez ?`
          : `${praise} Je regardais comment les ${trade}s de ${city} trouvent leurs clients sur internet. Et vous, aujourd’hui, ils vous trouvent comment ?`

  const proposal =
    site === "none" || site === "social"
      ? `On vous livre en dix jours un site à votre nom, pensé pour le téléphone, avec vos avis Google et un bouton pour vous appeler ou demander un devis. Vous n’avez rien à préparer : on part de ce que vous avez déjà.`
      : `On rend votre site rapide sur téléphone et on le fait remonter sur Google à ${city}, pour qu’il vous ramène des demandes plutôt que de les perdre.`

  return {
    script: {
      opening: `${who}, ici [ton prénom] de Cleads. Je vous appelle pour une raison précise, vous avez deux minutes ?`,
      hook: { text: hook, evidence: [] },
      questions: [
        "Aujourd’hui, vos nouveaux clients vous trouvent comment ?",
        "Il vous arrive de rater des appels ou des demandes quand vous êtes en intervention ?",
        "Un client de plus par mois, ça représenterait combien pour vous ?",
      ],
      proposal,
      close: "Le plus simple, c’est que je vous montre une maquette avec votre nom dessus : plutôt jeudi matin ou vendredi après-midi ?",
    },
    objections: [
      { objection: "Je n’ai pas besoin de site, j’ai assez de travail", answer: "Tant mieux ! Un site sert aussi à choisir vos chantiers : plus de demandes, c’est garder les plus rentables." },
      { objection: "C’est trop cher", answer: "Je comprends. À part le prix, l’idée vous parle ? Un seul client gagné grâce au site le rembourse souvent en quelques semaines." },
      { objection: "Rappelez-moi plus tard", answer: "Bien sûr. Qu’est-ce qui vous arrange : demain à la même heure, ou en fin de journée ?" },
    ],
  }
}
