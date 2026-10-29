import { describe, expect, it } from "vitest"
import { validatePassword } from "@/lib/auth/password"
import { LOCKOUT_WINDOW_MS, MAX_FAILED_LOGINS, isLockedOut, lockoutMinutesLeft } from "@/lib/auth/lockout"

describe("password policy", () => {
  it("accepts a long passphrase", () => {
    expect(validatePassword("trois chevaux bleus dansent", { email: "a@b.fr" })).toBeNull()
  })
  it.each([
    ["court", "Abc123!"],
    ["contient l'email", "marie.dupont-2026"],
    ["trop courant", "MotDePasse2026!!"],
    ["que des chiffres", "123456789012345"],
    ["caractère répété", "aaaaaaaaaaaaaa"],
  ])("refuses a password that is %s", (_label, pw) => {
    expect(validatePassword(pw, { email: "marie.dupont@cleads.fr" })).not.toBeNull()
  })
  it("refuses more than 128 characters", () => {
    expect(validatePassword("x1".repeat(70))).not.toBeNull()
  })
})

describe("sign-in lockout", () => {
  const now = new Date("2026-10-29T12:00:00Z")
  const ago = (min: number) => new Date(now.getTime() - min * 60000)

  it("locks after the maximum number of recent failures", () => {
    const failures = Array.from({ length: MAX_FAILED_LOGINS }, (_, i) => ago(i + 1))
    expect(isLockedOut(failures, now)).toBe(true)
    expect(isLockedOut(failures.slice(1), now)).toBe(false)
  })
  it("ignores failures older than the window", () => {
    const old = Array.from({ length: 10 }, () => new Date(now.getTime() - LOCKOUT_WINDOW_MS - 1000))
    expect(isLockedOut(old, now)).toBe(false)
  })
  it("tells how long to wait, at least one minute", () => {
    const failures = [ago(1), ago(2), ago(3), ago(4), ago(5)]
    expect(lockoutMinutesLeft(failures, now)).toBe(10)
    expect(lockoutMinutesLeft([], now)).toBe(0)
  })
})
