// E33, the AI caller: the rules that decide without a database (hooks, hours, outcome, cost, webhook signature).
import { describe, expect, it } from "vitest"
import {
  DEFAULT_HOOKS, buildPrompt, callableNumber, costMicrosOf, estimateWave, fillHook, finalOutcome, firstMessage, hooksOf, inCallingHours, parseFacts, parseTranscript, pickHook, retryable,
  type CallFacts,
} from "@/features/ai-caller/rules"
import { signPayload, verifySignature } from "@/lib/telephony/elevenlabs"
import { settingsSchema } from "@/features/ai-caller/schemas"

const facts = (over: Partial<CallFacts> = {}): CallFacts => ({
  company: "Plomberie Test",
  trade: "Plombier",
  city: "Nantes",
  contactName: null,
  site: "weak",
  mobileProblem: "le site met 9 s à s’afficher sur téléphone",
  searchProblem: null,
  auditPoints: ["Site lent sur téléphone"],
  hasMockup: false,
  ...over,
})

describe("hooks", () => {
  it("fills a hook with the fiche's facts", () => {
    expect(fillHook(DEFAULT_HOOKS.mobile, facts(), "mobile")).toBe("Sur téléphone, votre site a un souci : le site met 9 s à s’afficher sur téléphone. Et c’est sur téléphone que la plupart de vos clients vous cherchent.")
    expect(fillHook(DEFAULT_HOOKS.nosite, facts({ site: "none" }), "nosite")).toContain("un plombier à Nantes")
  })

  it("refuses a hook whose placeholder has nothing true to say", () => {
    expect(fillHook(DEFAULT_HOOKS.competition, facts(), "competition")).toBeNull()
    expect(fillHook(DEFAULT_HOOKS.nosite, facts({ city: null }), "nosite")).toBeNull()
  })

  it("auto picks the strongest true hook: mockup, no site, phone, Google", () => {
    const texts = hooksOf(null)
    expect(pickHook("auto", facts({ hasMockup: true }), texts)?.hook).toBe("mockup")
    expect(pickHook("auto", facts({ site: "social", mobileProblem: null }), texts)?.hook).toBe("nosite")
    expect(pickHook("auto", facts(), texts)?.hook).toBe("mobile")
    expect(pickHook("auto", facts({ mobileProblem: null, searchProblem: "absent de la carte Google" }), texts)?.hook).toBe("competition")
    expect(pickHook("auto", facts({ site: "ok", mobileProblem: null }), texts)).toBeNull()
  })

  it("a forced hook that does not fit falls back to what is true", () => {
    expect(pickHook("competition", facts(), hooksOf(null))?.hook).toBe("mobile")
    expect(pickHook("mobile", facts(), hooksOf(null))?.hook).toBe("mobile")
  })

  it("keeps the defaults for hooks never edited", () => {
    expect(hooksOf({ mobile: "  Texte perso sur {entreprise}  ", nosite: "" })).toMatchObject({ mobile: "Texte perso sur {entreprise}", nosite: DEFAULT_HOOKS.nosite })
  })

  it("only accepts the known placeholders in an edited hook", () => {
    expect(settingsSchema.safeParse({ hooks: { mobile: "Bonjour {entreprise}, votre site a un souci : {probleme}." } }).success).toBe(true)
    expect(settingsSchema.safeParse({ hooks: { mobile: "Bonjour {prenom}, votre site a un souci : {probleme}." } }).success).toBe(false)
  })
})

describe("who and when", () => {
  it("calls French numbers only", () => {
    expect(callableNumber("+33612345678")).toBe(true)
    expect(callableNumber("+32470123456")).toBe(false)
    expect(callableNumber("0612345678")).toBe(false)
    expect(callableNumber(null)).toBe(false)
  })

  it("calls on weekdays, 10–13 and 14–19 in Paris, never on a public holiday", () => {
    expect(inCallingHours(new Date("2026-11-10T09:30:00Z"))).toBe(true) // Tuesday 10:30 Paris
    expect(inCallingHours(new Date("2026-11-10T08:30:00Z"))).toBe(false) // 09:30
    expect(inCallingHours(new Date("2026-11-10T12:30:00Z"))).toBe(false) // 13:30 lunch
    expect(inCallingHours(new Date("2026-11-10T17:58:00Z"))).toBe(false) // 18:58: too late to start
    expect(inCallingHours(new Date("2026-11-14T10:00:00Z"))).toBe(false) // Saturday
    expect(inCallingHours(new Date("2026-11-11T10:00:00Z"))).toBe(false) // 11 November
  })
})

describe("what the agent is told", () => {
  it("says it is an AI first, and quotes only the fiche", () => {
    const b = { facts: facts(), hookText: "ACCROCHE-TEST", hostName: "Karim Test", format: "meet" as const, today: "mardi 10 novembre 2026 (2026-11-10)" }
    expect(firstMessage(b)).toMatch(/^Bonjour, ici l’assistante IA de Cleads\. Je suis bien chez Plomberie Test \?$/)
    const prompt = buildPrompt(b)
    expect(prompt).toContain("« ACCROCHE-TEST »")
    expect(prompt).toContain("Karim Test")
    expect(prompt).toContain("N’invente jamais un chiffre")
    expect(prompt).toContain("do_not_call")
    expect(prompt).toContain("2026-11-10")
  })
})

describe("what comes back", () => {
  it("reads the transcript and the collected facts", () => {
    expect(parseTranscript([{ role: "agent", message: "Bonjour", time_in_call_secs: 0 }, { role: "user", message: "  ", time_in_call_secs: 2 }, { role: "user", message: "Oui", time_in_call_secs: 3 }])).toEqual([
      { role: "agent", text: "Bonjour", at: 0 },
      { role: "user", text: "Oui", at: 3 },
    ])
    expect(parseFacts({ decision_maker: { value: "Oui, le gérant" }, objection: { value: "null" }, voicemail: { value: false } })).toEqual({ facts: { decision_maker: "Oui, le gérant" }, voicemail: false })
    expect(parseFacts({ voicemail: { value: "true" } }).voicemail).toBe(true)
  })

  it("a tool's result wins, then voicemail, silence, refusal", () => {
    expect(finalOutcome({ fromTool: "MEETING", voicemail: false, userSpoke: true, durationSec: 90 })).toBe("MEETING")
    expect(finalOutcome({ fromTool: null, voicemail: true, userSpoke: true, durationSec: 15 })).toBe("VOICEMAIL")
    expect(finalOutcome({ fromTool: null, voicemail: false, userSpoke: false, durationSec: 20 })).toBe("NO_ANSWER")
    expect(finalOutcome({ fromTool: null, voicemail: false, userSpoke: true, durationSec: 40 })).toBe("NOT_INTERESTED")
    expect(retryable("NO_ANSWER") && retryable("VOICEMAIL") && !retryable("NOT_INTERESTED")).toBe(true)
  })

  it("estimates the cost by the minute, rounded up", () => {
    expect(costMicrosOf(0)).toBe(0)
    expect(costMicrosOf(90)).toBe(172_500)
    const e = estimateWave(100)
    expect(e).toMatchObject({ reached: 35, meetingsLow: 1, meetingsHigh: 4 })
    expect(e.costMicros).toBeGreaterThan(6_000_000)
    expect(e.costMicros).toBeLessThan(7_000_000)
  })
})

describe("webhook signature", () => {
  const body = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: "conv_1" } })
  it("accepts ElevenLabs' signature and refuses a changed body, another secret or an old one", () => {
    const now = 1_800_000_000
    const header = signPayload(body, "whsec_test", now)
    expect(verifySignature(body, header, "whsec_test", now + 10)).toBe(true)
    expect(verifySignature(body + " ", header, "whsec_test", now)).toBe(false)
    expect(verifySignature(body, header, "other", now)).toBe(false)
    expect(verifySignature(body, header, "whsec_test", now + 3600)).toBe(false)
    expect(verifySignature(body, null, "whsec_test", now)).toBe(false)
    expect(verifySignature(body, "garbage", "whsec_test", now)).toBe(false)
  })
})
