import { describe, expect, it } from "vitest"
import { INVITATION_TTL_MS, checkMemberChange, generateToken, hashToken, invitationStatus } from "@/features/team/rules"
import { inviteSchema, memberChangeSchema } from "@/features/team/schemas"

describe("invitation tokens", () => {
  it("are long, unique and URL safe", () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
  it("are stored hashed, deterministically", () => {
    const t = generateToken()
    expect(hashToken(t)).toBe(hashToken(t))
    expect(hashToken(t)).not.toContain(t)
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("invitation status", () => {
  const now = new Date("2026-10-29T12:00:00Z")
  const base = { expiresAt: new Date(now.getTime() + INVITATION_TTL_MS), acceptedAt: null, revokedAt: null }
  it("is valid until it expires", () => {
    expect(invitationStatus(base, now)).toBe("valid")
    expect(invitationStatus({ ...base, expiresAt: new Date(now.getTime() - 1) }, now)).toBe("expired")
    expect(invitationStatus({ ...base, expiresAt: now }, now)).toBe("expired")
  })
  it("a used or revoked link is never valid again, even before expiry", () => {
    expect(invitationStatus({ ...base, acceptedAt: now }, now)).toBe("accepted")
    expect(invitationStatus({ ...base, revokedAt: now }, now)).toBe("revoked")
  })
})

describe("member changes", () => {
  const owner = { id: "o1", role: "OWNER" as const, active: true }
  const sdr = { id: "s1", role: "SDR" as const, active: true }
  it("refuses to change your own access", () => {
    expect(checkMemberChange({ actorId: "o1", target: owner, change: { active: false }, activeOwners: 2 })).toBe("self")
    expect(checkMemberChange({ actorId: "o1", target: owner, change: { role: "SDR" }, activeOwners: 2 })).toBe("self")
  })
  it("keeps at least one active owner", () => {
    expect(checkMemberChange({ actorId: "o2", target: owner, change: { role: "MANAGER" }, activeOwners: 1 })).toBe("last_owner")
    expect(checkMemberChange({ actorId: "o2", target: owner, change: { active: false }, activeOwners: 1 })).toBe("last_owner")
    expect(checkMemberChange({ actorId: "o2", target: owner, change: { role: "MANAGER" }, activeOwners: 2 })).toBeNull()
  })
  it("allows ordinary changes", () => {
    expect(checkMemberChange({ actorId: "o1", target: sdr, change: { role: "CLOSER" }, activeOwners: 1 })).toBeNull()
    expect(checkMemberChange({ actorId: "o1", target: sdr, change: { active: false }, activeOwners: 1 })).toBeNull()
  })
  it("promoting to owner never trips the last-owner rule", () => {
    expect(checkMemberChange({ actorId: "o1", target: sdr, change: { role: "OWNER" }, activeOwners: 1 })).toBeNull()
  })
})

describe("input schemas", () => {
  it("normalises the invited email and rejects unknown roles", () => {
    expect(inviteSchema.parse({ email: "  Marie@Cleads.FR ", role: "CLOSER" })).toEqual({ email: "marie@cleads.fr", role: "CLOSER" })
    expect(() => inviteSchema.parse({ email: "x@y.fr", role: "ADMIN" })).toThrow()
    expect(() => inviteSchema.parse({ email: "pas-un-email", role: "SDR" })).toThrow()
  })
  it("needs at least one change", () => {
    expect(() => memberChangeSchema.parse({})).toThrow()
    expect(memberChangeSchema.parse({ active: false })).toEqual({ active: false })
  })
})
