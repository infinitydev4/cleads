// Needs a disposable PostgreSQL with the migrations applied:
//   TEST_DATABASE_URL=postgresql://... npx vitest run tests/team.integration.test.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

suite("team access (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let svc: typeof import("@/features/team/service")
  let authOptions: typeof import("@/lib/auth/options").authOptions
  let hashFn: typeof import("bcryptjs").hash
  let owner: { id: string; name: string; email: string; image: null; role: "OWNER" }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    prisma = (await import("@/lib/prisma")).prisma
    svc = await import("@/features/team/service")
    authOptions = (await import("@/lib/auth/options")).authOptions
    hashFn = (await import("bcryptjs")).hash
  })
  afterAll(async () => {
    await prisma.$disconnect()
  })
  beforeEach(async () => {
    await prisma.auditLog.deleteMany()
    await prisma.invitation.deleteMany()
    await prisma.user.deleteMany()
    const u = await prisma.user.create({ data: { email: "owner@cleads.test", name: "Owner", role: "OWNER", password: await hashFn("correct horse battery", 4) } })
    owner = { id: u.id, name: "Owner", email: u.email!, image: null, role: "OWNER" }
  })

  const GOOD = "une phrase de passe très longue"

  it("invites, accepts once, and refuses a weak password without burning the link", async () => {
    const { token } = await svc.createInvitation(owner, { email: "closer@cleads.test", role: "CLOSER" })
    expect((await svc.inspectInvitation(token))?.status).toBe("valid")

    await expect(svc.acceptInvitation(token, { name: "Closer", password: "court" })).rejects.toMatchObject({ code: "invalid_password" })
    expect((await svc.inspectInvitation(token))?.status).toBe("valid")

    await svc.acceptInvitation(token, { name: "Closer", password: GOOD })
    const user = await prisma.user.findFirst({ where: { email: "closer@cleads.test" } })
    expect(user).toMatchObject({ role: "CLOSER", active: true, name: "Closer" })
    expect(user?.password).not.toBe(GOOD)

    await expect(svc.acceptInvitation(token, { name: "Closer", password: GOOD })).rejects.toMatchObject({ code: "invalid_invitation" })
  })

  it("lets exactly one of two simultaneous acceptances win", async () => {
    const { token } = await svc.createInvitation(owner, { email: "race@cleads.test", role: "SDR" })
    const results = await Promise.allSettled([
      svc.acceptInvitation(token, { name: "A", password: GOOD }),
      svc.acceptInvitation(token, { name: "B", password: GOOD }),
    ])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(await prisma.user.count({ where: { email: "race@cleads.test" } })).toBe(1)
  })

  it("a new invitation replaces the previous link", async () => {
    const first = await svc.createInvitation(owner, { email: "dup@cleads.test", role: "SDR" })
    await svc.createInvitation(owner, { email: "dup@cleads.test", role: "CLOSER" })
    expect((await svc.inspectInvitation(first.token))?.status).toBe("revoked")
  })

  it("refuses to invite someone who already has access, but promotes a former client", async () => {
    await expect(svc.createInvitation(owner, { email: "OWNER@cleads.test", role: "SDR" })).rejects.toMatchObject({ code: "already_member" })

    const client = await prisma.user.create({ data: { email: "client@cleads.test", name: "Ancien client", role: "USER" } })
    const { token } = await svc.createInvitation(owner, { email: "client@cleads.test", role: "VIEWER" })
    await svc.acceptInvitation(token, { name: "Ancien client", password: GOOD })
    expect(await prisma.user.findUnique({ where: { id: client.id } })).toMatchObject({ role: "VIEWER", active: true })
  })

  it("protects the last owner and the actor's own access", async () => {
    await expect(svc.updateMember(owner, owner.id, { active: false })).rejects.toMatchObject({ code: "forbidden_change" })
    const second = await prisma.user.create({ data: { email: "o2@cleads.test", role: "OWNER" } })
    // Two owners: demoting the other one is fine.
    await expect(svc.updateMember(owner, second.id, { role: "MANAGER" })).resolves.toMatchObject({ role: "MANAGER" })
    // Back to a single owner: the remaining one cannot be touched by a manager-turned-owner scenario.
    await prisma.user.update({ where: { id: second.id }, data: { role: "OWNER" } })
    await svc.updateMember(owner, second.id, { active: false })
    const third = await prisma.user.create({ data: { email: "o3@cleads.test", role: "SDR" } })
    await expect(svc.updateMember({ ...owner, id: third.id }, owner.id, { role: "SDR" })).rejects.toMatchObject({ code: "forbidden_change" })
  })

  it("audits what happened", async () => {
    const { token } = await svc.createInvitation(owner, { email: "audit@cleads.test", role: "SDR" })
    await svc.acceptInvitation(token, { name: "Audit", password: GOOD })
    const target = await prisma.user.findFirstOrThrow({ where: { email: "audit@cleads.test" } })
    await svc.updateMember(owner, target.id, { role: "CLOSER" })
    await svc.updateMember(owner, target.id, { active: false })
    const actions = (await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } })).map((l) => l.action)
    expect(actions).toEqual(["team.invited", "team.invite_accepted", "team.role_changed", "team.deactivated"])
  })

  describe("sign-in", () => {
    type Authorize = (c: { email: string; password: string }, req: object) => Promise<{ id: string } | null>
    const authorize = () => (authOptions.providers[0] as unknown as { options: { authorize: Authorize } }).options.authorize
    const login = (email: string, password: string) => authorize()({ email, password }, { headers: {} })

    it("accepts good credentials, records the sign-in", async () => {
      await expect(login("OWNER@cleads.test", "correct horse battery")).resolves.toMatchObject({ id: owner.id })
      expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).lastLoginAt).not.toBeNull()
      expect(await prisma.auditLog.count({ where: { action: "auth.login" } })).toBe(1)
    })

    it("answers the same way for an unknown account and a wrong password", async () => {
      const unknown = await login("nobody@cleads.test", "whatever whatever").catch((e) => e.message)
      const wrong = await login("owner@cleads.test", "wrong password here").catch((e) => e.message)
      expect(unknown).toBe("Identifiants invalides")
      expect(wrong).toBe("Identifiants invalides")
    })

    it("refuses deactivated accounts and former clients with the same message", async () => {
      const hashed = await hashFn("correct horse battery", 4)
      await prisma.user.create({ data: { email: "off@cleads.test", role: "SDR", active: false, password: hashed } })
      await prisma.user.create({ data: { email: "client@cleads.test", role: "USER", password: hashed } })
      await expect(login("off@cleads.test", "correct horse battery")).rejects.toThrow("Identifiants invalides")
      await expect(login("client@cleads.test", "correct horse battery")).rejects.toThrow("Identifiants invalides")
      const reasons = (await prisma.auditLog.findMany({ where: { action: "auth.login_failed" } })).map((l) => (l.metadata as { reason: string }).reason)
      expect(reasons.sort()).toEqual(["deactivated", "no_crm_access"])
    })

    it("locks after five failures, even for the right password, then explains", async () => {
      for (let i = 0; i < 5; i++) await login("owner@cleads.test", "wrong password here").catch(() => null)
      await expect(login("owner@cleads.test", "correct horse battery")).rejects.toThrow(/Trop de tentatives/)
    })
  })
})
