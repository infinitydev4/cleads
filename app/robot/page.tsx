import Link from "next/link"

export const metadata = {
  title: "CleadsAuditBot, le robot d’audit de Cleads",
  description: "Ce que lit le robot d’audit de Cleads, à quel rythme, et comment le bloquer.",
}

const UA = "Mozilla/5.0 (compatible; CleadsAuditBot/1.0; +https://cleads.fr/robot)"

/** The page our audit robot points to in its User-Agent (docs/crm-v1/AGENTS-IA.md §9): who we are, what it reads. */
export default function RobotPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-24">
        <header className="space-y-3">
          <p className="text-sm text-[#BFFF00]">Cleads · Robot d’audit</p>
          <h1 className="text-4xl font-bold">CleadsAuditBot</h1>
          <p className="text-lg text-gray-300">
            Le robot de Cleads, agence d’acquisition. Il lit quelques pages publiques d’un site quand un membre de notre équipe prépare un échange avec l’entreprise, pour lui proposer des améliorations concrètes de sa présence en ligne.
          </p>
        </header>
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Ce qu’il fait</h2>
          <ul className="list-disc space-y-2 pl-6 text-gray-300">
            <li>Il lit au plus cinq pages par site (accueil, contact, services, tarifs, questions fréquentes), une seule fois, à la demande d’une personne.</li>
            <li>Il lit d’abord votre fichier robots.txt et respecte ses règles.</li>
            <li>Il ne remplit aucun formulaire, ne se connecte à aucun compte, n’exécute aucun script et ne collecte aucune adresse email.</li>
            <li>La vitesse de vos pages est mesurée par Google PageSpeed Insights, pas par ce robot.</li>
          </ul>
        </section>
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Le reconnaître</h2>
          <p className="text-gray-300">Il s’annonce avec cet identifiant (User-Agent) :</p>
          <pre className="overflow-x-auto rounded-lg bg-white/10 p-4 text-sm">{UA}</pre>
        </section>
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Le bloquer</h2>
          <p className="text-gray-300">Ajoutez ces deux lignes à votre fichier robots.txt : il ne lira plus aucune page de votre site.</p>
          <pre className="overflow-x-auto rounded-lg bg-white/10 p-4 text-sm">{"User-agent: CleadsAuditBot\nDisallow: /"}</pre>
        </section>
        <p className="text-gray-400">
          Une question ? Nos coordonnées sont dans les{" "}
          <Link href="/mentions-legales" className="text-[#BFFF00] underline-offset-4 hover:underline">
            mentions légales
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
