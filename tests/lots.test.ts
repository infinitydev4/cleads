// Batches for the closers (9 November 2026): the manager's sentence read without any model, and the businesses a batch
// keeps — no real site when asked (a Facebook or Instagram page is not a site), a phone, the best rated first.
import { describe, expect, it } from "vitest"
import { lotName, parseLotPrompt } from "@/features/lots/prompt"
import { pickLot } from "@/features/lots/service"

describe("the manager's sentence", () => {
  it("reads the number, the trade, the place and « sans site »", () => {
    expect(parseLotPrompt("Trouve 100 électriciens à Nantes sans site web et prépare-les pour Fadel")).toEqual({ count: 100, activity: "électricien", location: "Nantes", noSite: true })
    expect(parseLotPrompt("50 plombiers chauffagistes sur Saint-Herblain")).toEqual({ count: 50, activity: "plombier chauffagiste", location: "Saint-Herblain", noSite: false })
    expect(parseLotPrompt("trouve 900 coiffeurs à Lyon").count).toBe(200)
    expect(parseLotPrompt("des boulangers")).toEqual({ noSite: false })
  })

  it("names the campaign after the request", () => {
    expect(lotName({ activity: "électricien", location: "Nantes", count: 100, noSite: true })).toBe("Électriciens à Nantes sans site web")
    expect(lotName({ activity: "coiffeurs", location: "Lyon", count: 10, noSite: false })).toBe("Coiffeurs à Lyon")
  })
})

describe("what a batch keeps", () => {
  const b = (id: number, website: string | null, phone: string | null, rating: number, reviews: number) => ({ id, name: `E${id}`, website, phone, rating, reviews_count: reviews }) as never
  const found = [
    b(1, "https://elec-martin.fr", "0240", 4.9, 200),
    b(2, "https://www.facebook.com/abc.elec", "0241", 4.6, 31),
    b(3, null, "0242", 4.8, 64),
    b(4, null, null, 5, 90),
    b(5, "instagram.com/ouest_depannage", "0243", 4.4, 88),
    b(6, null, "0244", 4.9, 3),
  ]

  it("sets aside real sites and missing phones, and puts the best backed ratings first", () => {
    const lot = pickLot(found, { count: 3, noSite: true })
    expect(lot).toMatchObject({ found: 6, withSite: 1, noPhone: 1 })
    expect(lot.kept.map((c) => [c.id, c.site])).toEqual([[3, "none"], [5, "social"], [2, "social"]])
  })

  it("keeps real sites when the sentence does not ask for « sans site »", () => {
    expect(pickLot(found, { count: 10, noSite: false }).kept.map((c) => c.id)).toEqual([1, 3, 5, 2, 6])
  })
})
