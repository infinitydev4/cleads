import { afterEach, describe, expect, it } from "vitest"
import { open, seal } from "@/lib/crypto/secret-box"
import { MAX_DAILY_CAP, WARMUP_DAYS, dailyAllowance, leadBlockers, mayEmailLead, recipientOf, warmedUpStart, warmupDay } from "@/features/outreach/rules"
import { hasPlaceholder, renderTemplate, templateErrors, templateValues } from "@/features/outreach/template"
import { composeText, originText } from "@/features/outreach/footer"
import { outreachHeaders, signUnsubscribeToken, unsubscribeLinks, verifyUnsubscribeToken } from "@/features/outreach/compose"
import { toTransportError } from "@/features/outreach/transport"
import { maskEmail } from "@/features/outreach/unsubscribe"
import { createMailboxSchema } from "@/features/outreach/schemas"

const KEY = Buffer.alloc(32, 7).toString("base64")

describe("secret box", () => {
  afterEach(() => {
    delete process.env.MAILBOX_SECRET_KEY
  })

  it("seals and opens, with a new nonce every time", () => {
    process.env.MAILBOX_SECRET_KEY = KEY
    const a = seal("mot de passe")
    const b = seal("mot de passe")
    expect(a).not.toBe(b)
    expect(a).not.toContain("mot de passe")
    expect(open(a)).toBe("mot de passe")
  })

  it("refuses a value sealed with another key or altered", () => {
    process.env.MAILBOX_SECRET_KEY = KEY
    const sealed = seal("secret")
    const parts = sealed.split(".")
    const tampered = [...parts.slice(0, 3), Buffer.from("autre").toString("base64url")].join(".")
    expect(() => open(tampered)).toThrow(/illisible/)
    process.env.MAILBOX_SECRET_KEY = Buffer.alloc(32, 9).toString("base64")
    expect(() => open(sealed)).toThrow(/illisible/)
  })

  it("will not seal without a proper key", () => {
    expect(() => seal("x")).toThrow(/MAILBOX_SECRET_KEY/)
    process.env.MAILBOX_SECRET_KEY = Buffer.alloc(16).toString("base64")
    expect(() => seal("x")).toThrow(/32 octets/)
  })
})

describe("warm-up", () => {
  const start = new Date("2026-11-02T09:00:00Z")
  const on = (iso: string) => new Date(iso)

  it("counts Paris calendar days, across the change of time", () => {
    expect(warmupDay(start, start)).toBe(0)
    expect(warmupDay(start, on("2026-11-02T22:59:00Z"))).toBe(0) // 23:59 in Paris
    expect(warmupDay(start, on("2026-11-02T23:01:00Z"))).toBe(1)
    expect(warmupDay(new Date("2026-03-28T12:00:00Z"), on("2026-03-30T12:00:00Z"))).toBe(2)
  })

  it("grows week by week and never passes the mailbox cap", () => {
    const box = { dailyCap: 30, warmupStartedAt: start }
    expect(dailyAllowance(box, start)).toBe(5)
    expect(dailyAllowance(box, on("2026-11-08T12:00:00Z"))).toBe(5)
    expect(dailyAllowance(box, on("2026-11-09T12:00:00Z"))).toBe(10)
    expect(dailyAllowance(box, on("2026-11-16T12:00:00Z"))).toBe(20)
    expect(dailyAllowance(box, on("2026-11-23T12:00:00Z"))).toBe(30)
    expect(dailyAllowance({ ...box, dailyCap: 45 }, on("2027-01-10T12:00:00Z"))).toBe(45)
    expect(dailyAllowance({ ...box, dailyCap: 8 }, on("2026-11-16T12:00:00Z"))).toBe(8)
    expect(dailyAllowance({ ...box, dailyCap: 500 }, on("2027-01-10T12:00:00Z"))).toBe(MAX_DAILY_CAP)
  })

  it("allows nothing before the warm-up starts, and a warmed-up start skips it", () => {
    expect(dailyAllowance({ dailyCap: 30, warmupStartedAt: on("2026-12-01T12:00:00Z") }, start)).toBe(0)
    expect(warmupDay(warmedUpStart(start), start)).toBe(WARMUP_DAYS)
    expect(dailyAllowance({ dailyCap: 30, warmupStartedAt: warmedUpStart(start) }, start)).toBe(30)
  })
})

describe("recipient and blockers", () => {
  const contact = { id: "c1", email: "Jean.Dupont@Plomberie.fr", emailKind: "UNKNOWN" as const, doNotContact: false, doNotContactReason: null }

  it("prefers the named contact, falls back on the company address as generic", () => {
    expect(recipientOf({ contact, company: { email: "contact@plomberie.fr" } })).toEqual({ email: "jean.dupont@plomberie.fr", kind: "NOMINATIVE", contactId: "c1" })
    expect(recipientOf({ contact: { ...contact, email: null }, company: { email: "contact@plomberie.fr" } })).toEqual({ email: "contact@plomberie.fr", kind: "GENERIC", contactId: null })
    expect(recipientOf({ contact: null, company: { email: "pas une adresse" } })).toBeNull()
  })

  it("lists every reason, and a do-not-contact person cannot be reached through the company address", () => {
    const recipient = { email: "contact@plomberie.fr", kind: "GENERIC" as const, contactId: null }
    expect(leadBlockers({ status: "NEW", recipient, contactDoNotContact: false, suppressed: false, mayWrite: true })).toEqual([])
    expect(leadBlockers({ status: "NEW", recipient, contactDoNotContact: true, suppressed: false, mayWrite: true })).toEqual(["do_not_contact"])
    expect(leadBlockers({ status: "DO_NOT_CONTACT", recipient: null, contactDoNotContact: false, suppressed: false, mayWrite: false })).toEqual(["not_yours", "lead_closed", "no_email"])
    expect(leadBlockers({ status: "CONTACTED", recipient, contactDoNotContact: false, suppressed: true, mayWrite: true })).toEqual(["suppressed"])
  })

  it("lets the fiche's owner write, plus the closer on an open opportunity; never an SDR on someone else's or the pool", () => {
    const lead = (ownerId: string | null, deals: { ownerId: string; stage: string }[] = []) => ({ ownerId, deals })
    expect(mayEmailLead({ id: "s", role: "SDR" }, lead("s"))).toBe(true)
    expect(mayEmailLead({ id: "s", role: "SDR" }, lead(null))).toBe(false)
    expect(mayEmailLead({ id: "s", role: "SDR" }, lead("x"))).toBe(false)
    expect(mayEmailLead({ id: "k", role: "CLOSER" }, lead("s", [{ ownerId: "k", stage: "PROPOSAL" }]))).toBe(true)
    expect(mayEmailLead({ id: "k", role: "CLOSER" }, lead("s", [{ ownerId: "k", stage: "WON" }]))).toBe(false)
    expect(mayEmailLead({ id: "m", role: "MANAGER" }, lead(null))).toBe(true)
    expect(mayEmailLead({ id: "v", role: "VIEWER" }, lead("v"))).toBe(false)
  })
})

describe("templates", () => {
  const values = templateValues({ contactName: "Jean Dupont", companyName: "Plomberie Dupont", city: "Lyon", website: "https://www.plomberie-dupont.fr/contact", senderName: "Marie Martin" })

  it("fills variables, uses fallbacks, and reports what is missing", () => {
    expect(values).toMatchObject({ prenom: "Jean", nom: "Jean Dupont", site: "plomberie-dupont.fr", expediteur_prenom: "Marie" })
    expect(renderTemplate("Bonjour {{prenom}}, {{ entreprise }} à {{ville}}", values)).toEqual({ text: "Bonjour Jean, Plomberie Dupont à Lyon", missing: [] })
    expect(renderTemplate("Bonjour {{prenom|Madame, Monsieur}}", templateValues({}))).toEqual({ text: "Bonjour Madame, Monsieur", missing: [] })
    expect(renderTemplate("Bonjour{{prenom|}},", templateValues({}))).toEqual({ text: "Bonjour,", missing: [] })
    const r = renderTemplate("Bonjour {{prenom}} ({{secteur}})", templateValues({ contactName: "Jean" }))
    expect(r.missing).toEqual(["secteur"])
    expect(hasPlaceholder(r.text)).toBe(true)
  })

  it("refuses unknown variables and unclosed braces when the template is saved", () => {
    expect(templateErrors("Bonjour {{prenom}} {{ville|ici}}")).toEqual([])
    expect(templateErrors("Bonjour {{firstname}}")[0]).toMatch(/Variable inconnue/)
    expect(templateErrors("Bonjour {{prenom")[0]).toMatch(/Accolades/)
  })
})

describe("the message", () => {
  afterEach(() => {
    delete process.env.OUTREACH_LINK_BASE_URL
  })

  it("always ends with the signature, the origin of the address and the unsubscribe link", () => {
    const text = composeText({ body: "Bonjour,\r\n\r\nUne question.  ", signature: null, senderName: "Marie Martin", origin: originText("EXTRACTOR"), unsubscribeUrl: "https://x.test/u/t" })
    expect(text).toBe("Bonjour,\n\nUne question.\n\nMarie Martin\n\n--\nVous recevez ce message à votre adresse professionnelle, trouvée sur la fiche publique de votre établissement ou votre site internet. Pour ne plus recevoir d’emails de notre part : https://x.test/u/t\n")
  })

  it("signs unsubscribe links on the message id, never the address, and refuses a forged one", () => {
    process.env.OUTREACH_LINK_BASE_URL = "https://trycleads.com/"
    const token = signUnsubscribeToken("msg-1")
    expect(verifyUnsubscribeToken(token)).toBe("msg-1")
    expect(verifyUnsubscribeToken(`msg-2.${token.split(".")[1]}`)).toBeNull()
    expect(verifyUnsubscribeToken("n’importe quoi")).toBeNull()
    const links = unsubscribeLinks("msg-1")
    expect(links.page).toBe(`https://trycleads.com/u/${token}`)
    expect(links.oneClick).toBe(`https://trycleads.com/api/public/unsubscribe/${token}`)
    expect(outreachHeaders(links.oneClick)).toEqual({ "List-Unsubscribe": `<${links.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" })
  })

  it("masks the address on the public page", () => {
    expect(maskEmail("jean.dupont@plomberie.fr")).toBe("j•••@plomberie.fr")
  })
})

describe("mailbox input and server errors", () => {
  const base = { address: "Marie@TryCleads.com", displayName: "Marie Martin", ownerId: null, smtpHost: "SMTP.gmail.com", smtpPort: "465", smtpSecure: true, username: "marie@trycleads.com", password: "x", imapHost: "", dailyCap: 30 }

  it("normalises the address and hosts, and caps the daily limit", () => {
    const parsed = createMailboxSchema.parse(base)
    expect(parsed).toMatchObject({ address: "marie@trycleads.com", smtpHost: "smtp.gmail.com", smtpPort: 465, imapHost: null, alreadyWarm: false })
    expect(() => createMailboxSchema.parse({ ...base, dailyCap: 51 })).toThrow()
    expect(() => createMailboxSchema.parse({ ...base, smtpHost: "smtp gmail" })).toThrow()
  })

  it("tells a refused password from an unreachable server", () => {
    expect(toTransportError({ code: "EAUTH", response: "535 5.7.8 Username and Password not accepted" }, "smtp").kind).toBe("auth")
    expect(toTransportError({ code: "ETIMEDOUT" }, "smtp").kind).toBe("connection")
    expect(toTransportError({ authenticationFailed: true }, "imap").message).toMatch(/IMAP refusés/)
    expect(toTransportError({ code: "EENVELOPE", responseCode: 550 }, "smtp").kind).toBe("recipient")
  })
})
