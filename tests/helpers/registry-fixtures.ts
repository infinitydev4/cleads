/**
 * Fictional BODACC notices and annuaire answers for the E30 tests, shaped exactly like the real ones (checked on
 * 2026-11-04): the structured parts of a notice are JSON text. Names and numbers are invented; SIRETs pass the Luhn
 * check so the import keeps them.
 */

/** A SIRET whose Luhn sum is valid, from a SIREN. */
export function siretOf(siren: string): string {
  for (let nic = 10; nic < 99999; nic++) {
    const s = `${siren}${String(nic).padStart(5, "0")}`
    const sum = [...s].reverse().reduce((acc, ch, i) => {
      let d = Number(ch) * (i % 2 ? 2 : 1)
      if (d > 9) d -= 9
      return acc + d
    }, 0)
    if (sum % 10 === 0) return s
  }
  throw new Error("no SIRET")
}

type Family = "creation" | "immatriculation" | "vente" | "modification" | "collective" | "radiation"

export function rawNotice(o: {
  id: string
  family: Family
  day: string
  dept?: string
  sirens: string[]
  person?: { pm?: string; nom?: string; prenom?: string | string[]; nomCommercial?: string }
  activity?: string
  postalCode?: string
  city?: string
  startedOn?: string
  judgment?: { nature: string; date?: string }
  change?: string
  registration?: string
  seller?: { pm: string; siren: string }
}): Record<string, unknown> {
  const p = o.person ?? { pm: "SOCIETE EXEMPLE" }
  const personne = p.pm
    ? { typePersonne: "pm", numeroImmatriculation: { numeroIdentification: o.sirens[0]?.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3") }, denomination: p.pm, ...(p.nomCommercial ? { nomCommercial: p.nomCommercial } : {}) }
    : { typePersonne: "pp", nom: p.nom, prenom: p.prenom, nomUsage: p.nom, ...(p.nomCommercial ? { nomCommercial: p.nomCommercial } : {}) }
  const acte: Record<string, unknown> = {}
  if (o.startedOn) acte.dateCommencementActivite = o.startedOn
  if (o.registration) acte.immatriculation = { categorieImmatriculation: o.registration }
  return {
    id: o.id,
    dateparution: o.day,
    familleavis: o.family,
    numerodepartement: o.dept ?? "69",
    commercant: p.pm ?? `${p.nom}, ${Array.isArray(p.prenom) ? p.prenom.join(", ") : p.prenom}`,
    ville: o.city ?? "Lyon",
    cp: o.postalCode ?? "69003",
    registre: o.sirens.flatMap((s) => [s, s.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")]),
    listepersonnes: JSON.stringify({ personne }),
    listeetablissements: o.activity ? JSON.stringify({ etablissement: { activite: o.activity, adresse: { codePostal: o.postalCode ?? "69003", ville: o.city ?? "Lyon" } } }) : null,
    acte: Object.keys(acte).length ? JSON.stringify(acte) : null,
    jugement: o.judgment ? JSON.stringify({ type: "initial", famille: "Jugement d'ouverture", nature: o.judgment.nature, date: o.judgment.date }) : null,
    modificationsgenerales: o.change ? JSON.stringify({ descriptif: o.change }) : null,
    listeprecedentproprietaire: o.seller ? JSON.stringify({ personne: { typePersonne: "pm", numeroImmatriculation: { numeroIdentification: o.seller.siren }, denomination: o.seller.pm } }) : null,
    url_complete: `https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:${o.id}`,
  }
}

/** An annuaire result, as recherche-entreprises returns it. */
export function annuaireResult(o: {
  siren: string
  name: string
  naf?: string
  created?: string
  active?: boolean
  band?: string
  postalCode?: string
  city?: string
  opposition?: boolean
  diffusion?: "O" | "P"
  officers?: { nom: string; prenoms: string; qualite: string }[]
}): Record<string, unknown> {
  return {
    siren: o.siren,
    nom_complet: o.name,
    nom_raison_sociale: o.name,
    activite_principale: o.naf ?? "43.22A",
    nature_juridique: "5710",
    date_creation: o.created ?? "2026-10-20",
    etat_administratif: o.active === false ? "C" : "A",
    tranche_effectif_salarie: o.band ?? "NN",
    categorie_entreprise: "PME",
    statut_diffusion: o.diffusion ?? "O",
    opposition_diffusion_commerciale: o.opposition ?? false,
    siege: { siret: siretOf(o.siren), code_postal: o.postalCode ?? "69003", libelle_commune: o.city ?? "Lyon" },
    dirigeants: (o.officers ?? []).map((d) => ({ ...d, type_dirigeant: "personne physique" })),
    complements: {},
  }
}

/**
 * A fake network for the BODACC and the annuaire: notices filtered by family, département and day as Opendatasoft
 * does, and annuaire answers by SIREN. It records what was asked.
 */
export function fakeRegistry(notices: Record<string, unknown>[], companies: Record<string, unknown>[]) {
  const calls = { bodacc: 0, annuaire: [] as string[] }
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.hostname.includes("opendatasoft")) {
      calls.bodacc++
      const where = url.searchParams.get("where") ?? ""
      const list = (field: string) => [...(where.match(new RegExp(`${field} in \\(([^)]*)\\)`))?.[1].matchAll(/"([^"]*)"/g) ?? [])].map((m) => m[1])
      const families = list("familleavis")
      const depts = list("numerodepartement")
      const from = where.match(/dateparution >= date'([\d-]+)'/)?.[1] ?? "0000"
      const to = where.match(/dateparution <= date'([\d-]+)'/)?.[1] ?? "9999"
      const hits = notices.filter((n) => families.includes(String(n.familleavis)) && (!depts.length || depts.includes(String(n.numerodepartement))) && String(n.dateparution) >= from && String(n.dateparution) <= to)
      const offset = Number(url.searchParams.get("offset") ?? 0)
      const limit = Number(url.searchParams.get("limit") ?? 100)
      return Response.json({ total_count: hits.length, results: hits.slice(offset, offset + limit) })
    }
    if (url.hostname === "recherche-entreprises.api.gouv.fr") {
      const q = url.searchParams.get("q") ?? ""
      calls.annuaire.push(q)
      return Response.json({ results: companies.filter((c) => c.siren === q) })
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch
  return { fetchImpl, calls }
}
