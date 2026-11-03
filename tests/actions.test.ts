import { describe, expect, it } from "vitest"
import { z } from "zod"
import { AGENTS, defineAgent, viaAgent } from "@/features/ai/agents"
import { ACTIONS, CORE_ACTIONS, rankActions } from "@/features/ai/actions/catalog"
import { ACTION_FAMILIES, FAMILY_INFO, allowedModes } from "@/features/ai/actions/families"
import { cutFamilies, effectivePolicy, modeOf, storedPolicy } from "@/features/ai/actions/policy"
import { FORBIDDEN_FOR_AGENTS, approvalOf, defineTool, isOpen, levelOf } from "@/features/ai/tools"
import { ACTION_TITLES, ACTION_TOOLS, CONTACT_TOOLS, TOOL_LABELS, UNDOABLE_TOOLS, recentTools } from "@/features/copilot/labels"
import { acting, withActing, withVia } from "@/lib/ai/acting"
import { transcriptionMicros } from "@/lib/ai/pricing"

// E28: the catalogue of actions, the agents' rights matrix, the search over actions and the "via" of what agents do.

const ctx = (policy?: ReturnType<typeof effectivePolicy>) => ({
  run: { id: "r", workspaceId: "w", agentId: "copilot" as const, requester: { id: "u", workspaceId: "w", name: "", email: "", image: null, role: "OWNER" as const }, userKey: "u", leadId: null },
  ...(policy ? { policy } : {}),
})

describe("the catalogue of actions", () => {
  it("declares each action once, in a family, with its words for the person", () => {
    const names = ACTIONS.map((a) => a.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.length).toBeGreaterThanOrEqual(60)
    for (const a of ACTIONS) {
      expect(a.family === null ? a.name : a.family, a.name).not.toBeNull()
      if (a.permission) expect(FORBIDDEN_FOR_AGENTS).not.toContain(a.permission)
      if (a.approval === "user" || a.family === "notes") expect(a.summarize, a.name).toBeTypeOf("function")
      expect(TOOL_LABELS[a.name], a.name).toBeDefined()
    }
    expect(ACTIONS.filter((a) => a.family === null).map((a) => a.name)).toEqual(["read_skill"])
    for (const c of CORE_ACTIONS) expect(names).toContain(c)
  })

  it("keeps the panel's lists in step with the catalogue", () => {
    const writes = ACTIONS.filter((a) => a.family && !["read_crm", "read_web", "navigation"].includes(a.family)).map((a) => a.name)
    expect([...ACTION_TOOLS].sort()).toEqual(writes.sort())
    for (const name of ACTION_TOOLS) expect(ACTION_TITLES[name], name).toBeDefined()
    expect([...UNDOABLE_TOOLS].sort()).toEqual(ACTIONS.filter((a) => a.undo).map((a) => a.name).sort())
    expect([...CONTACT_TOOLS].sort()).toEqual(ACTIONS.filter((a) => a.costClass === "external").map((a) => a.name).sort())
  })

  it("finds the action the model describes, in French", () => {
    const all = ACTIONS.filter((a) => !CORE_ACTIONS.has(a.name)).map((a) => ({ name: a.name, description: a.description }))
    expect(rankActions("lancer une recherche d'architectes à Nantes", all)[0]).toBe("start_search")
    expect(rankActions("importer les résultats de la recherche", all)[0]).toBe("import_search")
    expect(rankActions("inscrire des fiches en séquence", all)[0]).toBe("enroll_in_sequence")
    expect(rankActions("étiqueter des fiches", all)[0]).toBe("tag_leads")
    expect(rankActions("attribuer des fiches à un commercial", all)[0]).toBe("assign_leads")
    expect(rankActions("planifier un rendez-vous", all).slice(0, 3)).toContain("book_meeting")
    expect(rankActions("quels secteurs prospecter", all).slice(0, 3)).toContain("propose_targets")
    expect(rankActions("les des une", all)).toEqual([])
  })

  it("loads again the actions the last answers used", () => {
    const history = [
      { role: "assistant", parts: [{ type: "tool-tag_leads" }, { type: "text" }] },
      { role: "user", parts: [{ type: "text" }] },
      { role: "assistant", parts: [{ type: "tool-start_search" }, { type: "tool-find_actions" }] },
      { role: "assistant", parts: [{ type: "tool-import_search" }] },
    ]
    expect([...recentTools(history)].sort()).toEqual(["find_actions", "import_search", "start_search"])
  })
})

describe("the rights matrix", () => {
  it("gives the copilot the levels of D28, and specialists only their own families", () => {
    const p = effectivePolicy(AGENTS.copilot, null)
    expect(p).toEqual({ read_crm: "auto", read_web: "auto", notes: "auto", records: "confirm", campaigns: "confirm", prospecting: "confirm", ai_work: "confirm", outreach: "confirm", missions: "auto", navigation: "auto" })
    expect(Object.keys(AGENTS.copilot.families).sort()).toEqual([...ACTION_FAMILIES].sort())
    expect(effectivePolicy(AGENTS.auditor, null)).toEqual({ read_crm: "auto", read_web: "auto", ai_work: "confirm" })
    expect(modeOf(effectivePolicy(AGENTS.auditor, null), "outreach")).toBe("off")
  })

  it("ignores a saved level a family cannot have, and stores only what differs from the code", () => {
    const p = effectivePolicy(AGENTS.copilot, { records: "auto", notes: "confirm", prospecting: "off", unknown: "auto" })
    expect(p.records).toBe("confirm")
    expect(p.notes).toBe("confirm")
    expect(p.prospecting).toBe("off")
    expect(storedPolicy(AGENTS.copilot, p)).toEqual({ notes: "confirm", prospecting: "off" })
    expect(storedPolicy(AGENTS.copilot, effectivePolicy(AGENTS.copilot, null))).toBeNull()
    // A specialist's family is on or off: "confirm" is not a choice for it.
    expect(allowedModes("read_web", false)).toEqual(["off", "auto"])
    expect(effectivePolicy(AGENTS.auditor, { read_web: "confirm" }).read_web).toBe("auto")
    expect(cutFamilies(AGENTS.auditor, effectivePolicy(AGENTS.auditor, { read_web: "off" }))).toEqual(["read_web"])
  })

  it("makes a call wait for a click when the owner asks, never skips one, and closes a cut family", () => {
    const note = ACTIONS.find((a) => a.name === "add_note")!
    const status = ACTIONS.find((a) => a.name === "set_lead_status")!
    const enrol = ACTIONS.find((a) => a.name === "enroll_in_sequence")!
    expect(levelOf(note)).toBe("auto")
    expect(approvalOf(note, ctx())).toBe("auto")
    expect(approvalOf(note, ctx(effectivePolicy(AGENTS.copilot, { notes: "confirm" })))).toBe("confirm")
    expect(approvalOf(status, ctx())).toBe("confirm")
    expect(approvalOf(enrol, ctx())).toBe("explicit")
    expect(isOpen(status, effectivePolicy(AGENTS.copilot, { records: "off" }))).toBe(false)
    expect(isOpen(status, effectivePolicy(AGENTS.auditor, null))).toBe(false)
  })

  it("checks an agent's families, and a tool's family, at load", () => {
    expect(() => defineAgent({ ...AGENTS.copilot, families: { records: "auto" } })).toThrow(/impossible/)
    expect(() => defineAgent({ ...AGENTS.copilot, families: { nope: "auto" } as never })).toThrow(/inconnue/)
    const base = { description: "Test", input: z.object({}), execute: async () => ({ done: true }) }
    expect(() => defineTool({ ...base, name: "x_read", permission: "lead:read", approval: "auto", costClass: "free", family: null })).toThrow(/famille/)
    expect(() => defineTool({ ...base, name: "x_write", permission: "lead:write", approval: "auto", costClass: "free", family: "records" })).toThrow(/clic/)
    expect(() => defineTool({ ...base, name: "x_undo", permission: "lead:write", approval: "user", costClass: "free", family: "records", summarize: () => "x", undo: async () => {} })).toThrow(/annule/)
    expect(Object.values(FAMILY_INFO).every((f) => f.short.length <= 16)).toBe(true)
  })
})

describe("what agents do for a person", () => {
  it("says which agent it came through, and only then", async () => {
    expect(withVia({ event: "x" })).toEqual({ event: "x" })
    expect(acting()).toBeNull()
    await withActing({ agentId: "copilot", runId: "r1" }, async () => {
      expect(withVia({ event: "x" })).toEqual({ event: "x", via: { agentId: "copilot", runId: "r1" } })
      expect(withVia(undefined)).toEqual({ via: { agentId: "copilot", runId: "r1" } })
      expect(withVia("texte")).toBe("texte")
    })
    expect(acting()).toBeNull()
    expect(viaAgent("copilot")).toBe("via le Copilote")
    expect(viaAgent("auditor")).toBe("via l’Auditeur digital")
  })

  it("bills dictation by the minute of audio", () => {
    expect(transcriptionMicros("mistral/voxtral-mini-transcribe-3", 60, 1)).toBe(3_000)
    expect(transcriptionMicros("mistral/voxtral-mini-transcribe-3", 0.2, 1)).toBe(50)
    expect(transcriptionMicros("inconnu/modele", 60, 1)).toBe(6_000)
  })
})
