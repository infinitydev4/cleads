import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { z } from "zod"
import { parsePage } from "@/features/copilot/page-kind"
import { describeFilters } from "@/features/copilot/context"
import { applyAnswers, forModel, questionText, refusePending, titleOf, REFUSED, type CopilotMessage } from "@/features/copilot/messages"
import { leadIdsOf, leadRefsIn, suggestionsFor } from "@/features/copilot/labels"
import { COPILOT_TOOLS, toolsFor } from "@/features/copilot/tools"
import { copilotRules } from "@/features/copilot/agent"
import { AGENTS } from "@/features/ai/agents"
import { chatTools, defineTool } from "@/features/ai/tools"
import { LeadError } from "@/features/leads/errors"
import { Markdown, blocksOf } from "@/components/crm/copilot/markdown"

const LEAD = "cmvzkralk00010syob1by8k0h"

describe("the page the copilot sits on", () => {
  it("reads the CRM's addresses, ids and the list's filters", () => {
    expect(parsePage("/app")).toEqual({ kind: "today", path: "/app" })
    expect(parsePage(`/app/leads/${LEAD}`)).toEqual({ kind: "lead", path: `/app/leads/${LEAD}`, id: LEAD })
    expect(parsePage(`/app/leads/${LEAD}?brouillon=x`)).toMatchObject({ kind: "lead", id: LEAD })
    expect(parsePage("/app/leads/import")?.kind).toBe("leads")
    expect(parsePage("/app/leads?status=NEW,REPLIED&city=Lyon&owner=me")).toMatchObject({ kind: "leads", filters: { status: ["NEW", "REPLIED"], city: "Lyon", owner: "me" } })
    expect(parsePage(`/app/campaigns/${LEAD}`)).toMatchObject({ kind: "campaign", id: LEAD })
    expect(parsePage(`/app/studio/${LEAD}`)).toMatchObject({ kind: "site", id: LEAD })
    expect(parsePage("/app/pipeline")?.kind).toBe("pipeline")
    expect(parsePage("/app/3d")?.kind).toBe("hq")
    expect(parsePage("/app/settings/ai")?.kind).toBe("other")
  })

  it("ignores anything outside the CRM, and odd ids", () => {
    for (const raw of [null, "", "/", "/dashboard", "https://evil.test/app/leads/x", "//evil.test/app", "javascript:alert(1)", `/app/leads/${"a".repeat(41)}`, "x".repeat(3_000)]) {
      const page = parsePage(raw)
      expect(page === null || page.id === undefined).toBe(true)
    }
    expect(parsePage("https://evil.test/app")).toBeNull()
    expect(parsePage("/app/leads/../../etc")?.id).toBeUndefined()
  })

  it("describes a list's filters in words", () => {
    const page = parsePage("/app/leads?status=NEW&city=Lyon&minScore=60&hasEmail=1&campaign=none")!
    expect(describeFilters(page.filters!)).toBe("statut Nouveau, ville Lyon, score ≥ 60, avec email, hors campagne")
  })

  it("offers questions for the page", () => {
    expect(suggestionsFor("lead")[0]).toMatch(/fiche/)
    expect(suggestionsFor(null)).toHaveLength(3)
  })
})

const tool = (state: string, extra: Record<string, unknown> = {}) => ({ type: "tool-create_task", toolCallId: "c1", input: { leadId: LEAD, title: "Rappeler" }, state, ...extra })
const answer = (parts: unknown[], id = "a1"): CopilotMessage => ({ id, role: "assistant", parts: parts as CopilotMessage["parts"] })

describe("messages", () => {
  it("takes a question's text only, cleaned and bounded", () => {
    expect(questionText([{ type: "text", text: " Bonjour\u0000 " }, { type: "file" }, { type: "text", text: "suite" }])).toBe("Bonjour\nsuite")
    expect(questionText([{ type: "text", text: "x".repeat(5_000) }])).toHaveLength(4_000)
    expect(titleOf("  Une  question\nsur deux lignes ")).toBe("Une question sur deux lignes")
    expect(titleOf("a".repeat(100))).toHaveLength(80)
  })

  it("applies only the answers to what the server asked", () => {
    const stored = answer([tool("approval-requested", { approval: { id: "ap1" } }), tool("approval-requested", { toolCallId: "c2", approval: { id: "ap2", isAutomatic: true } })])
    const incoming = {
      id: "a1",
      role: "assistant" as const,
      parts: [
        { ...tool("approval-responded"), approval: { id: "ap1", approved: false, reason: "pas\u0007 maintenant" } },
        // An automatic decision, an unknown call and a wrong approval id are not the person's to give.
        { ...tool("approval-responded"), toolCallId: "c2", approval: { id: "ap2", approved: true } },
        { ...tool("approval-responded"), toolCallId: "c9", approval: { id: "ap1", approved: true } },
        { ...tool("output-available"), output: { done: true } },
      ],
    }
    const { message, answered } = applyAnswers(stored, incoming)
    expect(answered).toBe(1)
    expect(message.parts[0]).toMatchObject({ state: "approval-responded", approval: { id: "ap1", approved: false, reason: "pas  maintenant" } })
    expect(message.parts[1]).toMatchObject({ state: "approval-requested" })
    // Another message, or a refusal without a reason.
    expect(applyAnswers(stored, { ...incoming, id: "autre" }).answered).toBe(0)
    const plain = applyAnswers(stored, { ...incoming, parts: [{ ...tool("approval-responded"), approval: { id: "ap1", approved: false } }] })
    expect(plain.message.parts[0]).toMatchObject({ approval: { reason: REFUSED } })
  })

  it("refuses what waits when a new question comes", () => {
    const { message, refused } = refusePending(answer([{ type: "text", text: "Je propose :" }, tool("approval-requested", { approval: { id: "ap1" } })]))
    expect(refused).toBe(1)
    expect(message.parts[1]).toMatchObject({ state: "output-denied", approval: { approved: false } })
    expect(refusePending(answer([{ type: "text", text: "Rien" }])).refused).toBe(0)
  })

  it("gives the model the latest messages, each question with its date and page, older results summed up", () => {
    const q = (id: string): CopilotMessage => ({ id, role: "user", parts: [{ type: "text", text: `question ${id}` }], metadata: { at: "2026-11-02T09:30:00.000Z", context: { path: "/app", label: "Aujourd’hui", line: "Page ouverte : Aujourd’hui." } } })
    const a = (id: string): CopilotMessage => answer([{ type: "reasoning", text: "je pense" }, { type: "tool-get_lead", toolCallId: `t${id}`, state: "output-available", input: { leadId: LEAD }, output: { leadId: LEAD, name: "Plomberie Dupont" } }, { type: "text", text: "ok" }], id)
    const all = [a("a0"), q("q1"), a("a1"), q("q2"), a("a2"), q("q3"), a("a3")]
    const out = forModel(all)
    expect(out[0].id).toBe("q1")
    expect(out.flatMap((m) => m.parts).some((p) => p.type === "reasoning")).toBe(false)
    expect(out[0].parts[0]).toEqual({ type: "text", text: "[Nous sommes le lundi 2 novembre 2026 à 10:30 (heure de Paris). Page ouverte : Aujourd’hui.]" })
    const outputOf = (id: string) => (out.find((m) => m.id === id)!.parts.find((p) => p.type === "tool-get_lead") as { output: unknown }).output
    expect(outputOf("a1")).toMatchObject({ résultatAncien: true })
    expect(outputOf("a3")).toEqual({ leadId: LEAD, name: "Plomberie Dupont" })
  })
})

describe("fiches named in the answers", () => {
  it("finds { leadId, name } in a tool's result", () => {
    expect(leadRefsIn({ total: 2, leads: [{ leadId: LEAD, name: "A" }, { leadId: "cmvzkralk00010syob1by8k0i", name: "B" }, { leadId: "bad id", name: "C" }] })).toEqual([
      { id: LEAD, name: "A" },
      { id: "cmvzkralk00010syob1by8k0i", name: "B" },
    ])
    expect(leadRefsIn(null)).toEqual([])
  })

  it("counts only what a call actually read or did", () => {
    const parts = [
      { type: "tool-get_lead", state: "output-available", input: { leadId: LEAD }, output: { leadId: LEAD, name: "A" } },
      { type: "tool-get_lead", state: "output-error", input: { leadId: "cmvzkralk00010syob1by8k0x" } },
      { type: "tool-create_task", state: "output-denied", input: { leadId: "cmvzkralk00010syob1by8k0y" } },
      { type: "text", text: "cmvzkralk00010syob1by8k0z" },
    ]
    expect(leadIdsOf({ parts })).toEqual([LEAD])
  })
})

describe("the model's text, rendered safely", () => {
  it("reads paragraphs and lists", () => {
    expect(blocksOf("Bonjour\n\n- un\n- deux\n  suite\n1. a\n2) b\n\n## Titre\nfin")).toEqual([
      { kind: "p", lines: ["Bonjour"] },
      { kind: "ul", items: ["un", "deux suite"] },
      { kind: "ol", items: ["a", "b"] },
      { kind: "p", lines: ["Titre", "fin"] },
    ])
  })

  it("never makes HTML or links from the model's words", () => {
    const html = renderToStaticMarkup(createElement(Markdown, { text: "**Gras** et *italique* `code` <img src=x onerror=alert(1)> [lien](https://evil.test) https://evil.test" }))
    expect(html).toContain("<strong>Gras</strong>")
    expect(html).toContain("<em>italique</em>")
    expect(html).not.toContain("<img")
    expect(html).not.toContain("<a")
    expect(html).toContain("&lt;img")
  })
})

describe("the copilot's tools", () => {
  it("matches the agent's declared tools", () => {
    expect([...AGENTS.copilot.tools].sort()).toEqual(COPILOT_TOOLS.map((t) => t.name).sort())
    expect(AGENTS.copilot.available).toBe(true)
  })

  it("asks the person before anything that changes or spends, except reading and small notes (D28)", () => {
    const auto = COPILOT_TOOLS.filter((t) => t.approval === "auto")
    expect(auto.every((t) => t.costClass === "free")).toBe(true)
    // E28: a mission is only proposed without a click; the person launches it from its card.
    expect(auto.every((t) => t.family === null || ["read_crm", "read_web", "notes", "navigation", "missions"].includes(t.family))).toBe(true)
    expect(auto.filter((t) => t.family === "missions").map((t) => t.name)).toEqual(["propose_mission"])
    expect(auto.filter((t) => t.family === "notes").map((t) => t.name).sort()).toEqual(["add_note", "complete_task", "create_task", "log_call", "reschedule_task", "tag_leads", "untag_leads"])
    // What contacts a prospect always waits for its own click.
    expect(COPILOT_TOOLS.filter((t) => t.costClass === "external").map((t) => t.name).sort()).toEqual(["book_meeting", "change_meeting", "enroll_in_sequence", "resume_sequence", "share_studio_link"])
    expect(COPILOT_TOOLS.filter((t) => t.costClass === "external").every((t) => t.approval === "user")).toBe(true)
  })

  it("offers only what the role allows", () => {
    const names = (role: "OWNER" | "SDR" | "CLOSER" | "VIEWER") => toolsFor({ role }, { skills: true }).map((t) => t.name)
    expect(names("OWNER")).toHaveLength(COPILOT_TOOLS.length)
    expect(names("VIEWER")).toEqual([
      "search_leads",
      "get_lead",
      "get_timeline",
      "get_lead_audit",
      "get_lead_registry",
      "list_signals",
      "get_today",
      "list_meetings",
      "get_pipeline",
      "list_campaigns",
      "get_campaign",
      "get_campaign_sorting",
      "get_strategy",
      "get_metrics",
      "list_team",
      "list_offers",
      "read_skill",
      "open_page",
      "list_missions",
    ])
    // A closer searches nothing on the Extractor and imports nothing.
    expect(names("CLOSER")).not.toContain("start_search")
    expect(names("CLOSER")).not.toContain("import_search")
    expect(names("SDR")).toContain("start_search")
    expect(toolsFor({ role: "SDR" }, { skills: false }).map((t) => t.name)).not.toContain("read_skill")
    expect(copilotRules({ role: "CLOSER" })).toContain("rôle : Closer")
  })

  it("asks with the action in words, or refuses before asking", async () => {
    const def = defineTool({
      name: "demo_action",
      description: "Une action",
      permission: "task:write",
      approval: "user",
      costClass: "free",
      family: "notes",
      input: z.object({ ok: z.boolean() }),
      summarize: async (input) => {
        if (!input.ok) throw new LeadError("not_found", "Fiche introuvable pour cette personne.", 404)
        return "Faire la démonstration."
      },
      execute: async () => ({ done: true }),
    })
    const run = (role: "SDR" | "VIEWER") => ({ run: { id: "r", workspaceId: "w", agentId: "copilot" as const, requester: { id: "u", workspaceId: "w", name: "", email: "", image: null, role }, userKey: "u", leadId: null } })
    const { toolApproval } = chatTools([def], run("SDR"))
    expect(await toolApproval.demo_action({ ok: true })).toEqual({ type: "user-approval", reason: "Faire la démonstration." })
    expect(await toolApproval.demo_action({ ok: false })).toEqual({ type: "denied", reason: "Fiche introuvable pour cette personne." })
    expect((await chatTools([def], run("VIEWER")).toolApproval.demo_action({ ok: true })) as { type: string }).toMatchObject({ type: "denied" })
  })
})
