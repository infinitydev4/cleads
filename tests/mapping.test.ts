import { describe, expect, it } from "vitest"
import { guessMapping, mapRow } from "@/features/leads/mapping"

describe("CSV column guessing", () => {
  it("recognises usual French headers", () => {
    const m = guessMapping(["Nom de l'entreprise", "E-mail", "Téléphone", "Site web", "Ville", "Code postal", "SIRET", "Catégorie", "Contact", "Fonction", "Colonne inutile"])
    expect(m).toMatchObject({
      "Nom de l'entreprise": "name", "E-mail": "email", Téléphone: "phone", "Site web": "website", Ville: "city", "Code postal": "postalCode",
      SIRET: "siret", Catégorie: "sector", Contact: "contactName", Fonction: "jobTitle", "Colonne inutile": "",
    })
  })
  it("recognises English headers and exports with underscores", () => {
    const m = guessMapping(["company_name", "email", "phone", "website", "city", "place_id"])
    expect(m).toMatchObject({ company_name: "name", email: "email", phone: "phone", website: "website", city: "city", place_id: "externalId" })
  })
  it("gives each field to one column only", () => {
    const m = guessMapping(["Email", "Mail", "Courriel"])
    expect(Object.values(m).filter((f) => f === "email")).toHaveLength(1)
    expect(m.Email).toBe("email")
  })
  it("maps rows, trimming and keeping the first non-empty value of columns that share a field", () => {
    const row = mapRow({ A: "  Dupont  ", B: "", C: "x@y.fr", D: "autre@y.fr" }, { A: "name", B: "city", C: "email", D: "email" })
    expect(row).toEqual({ name: "Dupont", email: "x@y.fr" })
  })
})
