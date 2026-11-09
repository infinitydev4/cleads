// The free call script (9 November 2026): filled with the fiche's real facts, with no model.
import { describe, expect, it } from "vitest"
import { templateScript } from "@/features/leads/template-script"

const lead = (website: string | null) => ({
  company: { website, sector: "Électricien", city: "Nantes", rating: 4.8, reviewCount: 64 },
  contact: { name: "Paul Martin" },
}) as never

describe("the free call script", () => {
  it("opens on the fiche's own facts and names the page that stands for a site", () => {
    const none = templateScript(lead(null), "none")
    expect(none.script.opening).toMatch(/^Bonjour Paul Martin, ici \[ton prénom\] de Cleads/)
    expect(none.script.hook.text).toContain("4,8 sur Google avec 64 avis")
    expect(none.script.hook.text).toContain("un électricien à Nantes")
    expect(templateScript(lead("https://www.facebook.com/abc"), "social").script.hook.text).toContain("une page Facebook, mais pas de site")
    expect(none.objections).toHaveLength(3)
  })
})
