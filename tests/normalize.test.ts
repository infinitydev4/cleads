import { describe, expect, it } from "vitest"
import {
  companyDomain, domainFromUrl, formatPhone, inferEmailKind, nameKey, normalizeEmail, normalizeName, normalizePhone, normalizeSiret, normalizeTags,
} from "@/lib/crm/normalize"
import { scoreLead } from "@/features/leads/scoring"

describe("emails", () => {
  it("cleans and validates", () => {
    expect(normalizeEmail("  Contact@Dupont-Plomberie.FR ")).toBe("contact@dupont-plomberie.fr")
    expect(normalizeEmail("mailto:a@b.fr")).toBe("a@b.fr")
    expect(normalizeEmail("a@b.fr; c@d.fr")).toBe("a@b.fr")
    for (const bad of ["", null, "pas un email", "a@b", "@b.fr", "a@@b.fr"]) expect(normalizeEmail(bad)).toBeNull()
  })
  it("tells nominative from generic addresses", () => {
    expect(inferEmailKind("marie.durand@x.fr")).toBe("NOMINATIVE")
    // Conservative: only the plain first.last shape counts as nominative; compound names are left to a person.
    expect(inferEmailKind("jean-paul_martin@x.fr")).toBe("UNKNOWN")
    expect(inferEmailKind("contact@x.fr")).toBe("GENERIC")
    expect(inferEmailKind("contact2@x.fr")).toBe("GENERIC")
    expect(inferEmailKind("réservation@x.fr")).toBe("GENERIC")
    expect(inferEmailKind("mdurand@x.fr")).toBe("UNKNOWN")
    expect(inferEmailKind("nope")).toBe("UNKNOWN")
  })
})

describe("domains", () => {
  it("extracts the business site, never a directory or a social page", () => {
    expect(domainFromUrl("https://www.Dupont-Plomberie.fr/contact?x=1")).toBe("dupont-plomberie.fr")
    expect(domainFromUrl("dupont-plomberie.fr")).toBe("dupont-plomberie.fr")
    for (const bad of ["https://www.facebook.com/dupont", "https://dupont.business.site", "https://instagram.com/x", "https://www.pagesjaunes.fr/pros/1", "not a url", "localhost", null, ""]) {
      expect(domainFromUrl(bad as string)).toBeNull()
    }
  })
  it("falls back to a company mailbox, but not to a free provider", () => {
    expect(companyDomain(null, "paul@dupont-plomberie.fr")).toBe("dupont-plomberie.fr")
    expect(companyDomain(null, "paul@gmail.com")).toBeNull()
    expect(companyDomain("https://facebook.com/x", "paul@orange.fr")).toBeNull()
    expect(companyDomain("https://a.fr", "paul@b.fr")).toBe("a.fr")
  })
})

describe("phones", () => {
  it("canonicalises French numbers whatever the way they are typed", () => {
    for (const raw of ["01 23 45 67 89", "01.23.45.67.89", "0123456789", "+33 1 23 45 67 89", "0033123456789", "+33 (0)1 23 45 67 89"]) {
      expect(normalizePhone(raw), raw).toBe("+33123456789")
    }
  })
  it("keeps international numbers and refuses junk", () => {
    expect(normalizePhone("+971 4 123 4567")).toBe("+97141234567")
    expect(normalizePhone("00971412345678")).toBe("+971412345678")
    for (const bad of ["", null, "12345", "0023", "abc", "00 00 00 00 00", "+33 12"]) expect(normalizePhone(bad as string), String(bad)).toBeNull()
  })
  it("formats for display", () => {
    expect(formatPhone("+33123456789")).toBe("01 23 45 67 89")
    expect(formatPhone("+97141234567")).toBe("+97141234567")
    expect(formatPhone(null)).toBe("")
  })
})

describe("names and keys", () => {
  it("ignores accents, case, punctuation and legal forms", () => {
    expect(normalizeName("Éts. Dupont & Fils SARL")).toBe("ets dupont fils")
    expect(normalizeName("  BOULANGERIE  du  Port ")).toBe("boulangerie du port")
    expect(normalizeName("Dupont SAS")).toBe(normalizeName("DUPONT"))
  })
  it("keeps same-name shops of different cities apart, and refuses weak keys", () => {
    expect(nameKey("Boulangerie Paul", "Lyon")).not.toBe(nameKey("Boulangerie Paul", "Lille"))
    expect(nameKey("Boulangerie Paul", "Lyon")).toBe(nameKey("BOULANGERIE PAUL SARL", "lyon"))
    expect(nameKey("AB", "Lyon")).toBeNull()
    expect(nameKey("Boulangerie Paul", "")).toBeNull()
  })
})

describe("siret and tags", () => {
  it("validates the checksum", () => {
    expect(normalizeSiret("732 829 320 00074")).toBe("73282932000074")
    expect(normalizeSiret("73282932000075")).toBeNull()
    expect(normalizeSiret("123")).toBeNull()
  })
  it("normalises tags", () => {
    expect(normalizeTags("Plombier, À rappeler; urgent ,plombier")).toEqual(["plombier", "a-rappeler", "urgent"])
    expect(normalizeTags(["  VIP "])).toEqual(["vip"])
    expect(normalizeTags("x".repeat(40))).toEqual([])
  })
})

describe("score", () => {
  it("explains every point and caps at 100", () => {
    const full = scoreLead({ email: "marie@x.fr", emailKind: "NOMINATIVE", phone: "+33123456789", website: "https://x.fr", domain: "x.fr", rating: 4.8, reviewCount: 120, completeness: 90, contactName: "Marie", address: "1 rue A", city: "Lyon" })
    expect(full.score).toBe(100)
    expect(full.reasons.reduce((s, r) => s + r.points, 0)).toBeGreaterThanOrEqual(full.score)
    expect(full.reasons.every((r) => r.label && r.points > 0)).toBe(true)
  })
  it("is zero for an empty fiche and rewards a nominative email over a generic one", () => {
    expect(scoreLead({}).score).toBe(0)
    const nominative = scoreLead({ email: "a.b@x.fr", emailKind: "NOMINATIVE" }).score
    const generic = scoreLead({ email: "contact@x.fr", emailKind: "GENERIC" }).score
    expect(nominative).toBeGreaterThan(generic)
  })
  it("uses thresholds, not gradients", () => {
    expect(scoreLead({ rating: 4.5 }).score).toBe(10)
    expect(scoreLead({ rating: 4.2 }).score).toBe(6)
    expect(scoreLead({ rating: 3.9 }).score).toBe(0)
    expect(scoreLead({ reviewCount: 10 }).score).toBe(5)
    expect(scoreLead({ reviewCount: 9 }).score).toBe(0)
  })
})
