import { z } from "zod"
import { isToolUIPart, type UIMessage } from "ai"

/**
 * The copilot's messages (E24), in the AI SDK's UI format: what the panel shows, what is stored, and what the model
 * reads back. The server keeps the conversation: from the browser it takes a question's text, or a person's answers to
 * the approvals it asked for, and nothing else. A forged history, an approval of a call it never proposed, or a tool
 * result written by the browser cannot reach the model.
 */

export const MAX_QUESTION_CHARS = 4_000
/** What the model reads of a conversation: its latest messages (older ones stay on screen and in the database). */
export const HISTORY_WINDOW = 24
/** Answers whose tools' results the model reads in full; older ones are summed up. */
export const FRESH_ANSWERS = 2
const OLD_RESULT = "résultatAncien"

export interface QuestionContext {
  path: string
  label: string
  /** The page in one line for the model, ids included. */
  line: string
  leadId?: string
  campaignId?: string
}

export interface CopilotMetadata {
  /** A question: where the person was. */
  context?: QuestionContext
  /** When the question was asked (ISO), for "demain" and "cette semaine". */
  at?: string
  /** An answer: the turns that wrote it, what they cost, and why it stopped early, if it did. */
  runIds?: string[]
  costMicros?: number
  model?: string
  stopped?: "budget" | "time" | "aborted" | "error" | "steps"
}

export type CopilotMessage = UIMessage<CopilotMetadata>
type Part = CopilotMessage["parts"][number]

const UI_ID = /^[A-Za-z0-9_-]{1,100}$/

/** A question from the browser: its id and its text, nothing more. */
export const questionSchema = z.object({
  id: z.string().regex(UI_ID),
  role: z.literal("user"),
  parts: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).min(1).max(20),
})

/** The person's answers to approvals, as the browser holds them: matched against the stored message, never trusted. */
export const answersSchema = z.object({
  id: z.string().regex(UI_ID),
  role: z.literal("assistant"),
  parts: z.array(z.record(z.string(), z.unknown())).max(200),
})

/** The text of a question, cleaned; empty when there is none. */
export function questionText(parts: readonly { type: string; text?: string }[]): string {
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_QUESTION_CHARS)
}

const NOT_ANSWERED = "Non validée : la conversation a continué sans réponse."
/** What the model reads of a refusal the person gave without a reason. */
export const REFUSED = "Refusée par la personne : ne la repropose pas, sauf si elle le demande."

/** Tool parts waiting for the person (manual approvals only; automatic ones resolve on their own). */
export const pendingApprovals = (message: CopilotMessage | undefined): number =>
  message?.role === "assistant" ? message.parts.filter((p) => isToolUIPart(p) && p.state === "approval-requested" && !p.approval.isAutomatic).length : 0

/**
 * Applies the person's answers to the approvals of the last answer. Only what the server asked is answered: a part
 * whose call, approval id and state match the stored one, still waiting. Returns the updated message and how many
 * answers were taken.
 */
export function applyAnswers(stored: CopilotMessage, incoming: z.infer<typeof answersSchema>): { message: CopilotMessage; answered: number } {
  if (stored.role !== "assistant" || stored.id !== incoming.id) return { message: stored, answered: 0 }
  const answers = new Map<string, { approved: boolean; reason?: string }>()
  for (const raw of incoming.parts) {
    const approval = raw.approval as { id?: unknown; approved?: unknown; reason?: unknown } | undefined
    if (typeof raw.toolCallId !== "string" || !approval || typeof approval.id !== "string" || typeof approval.approved !== "boolean") continue
    if (raw.state !== "approval-responded" && raw.state !== "output-denied") continue
    const reason = typeof approval.reason === "string" ? approval.reason.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 300) : undefined
    answers.set(`${raw.toolCallId}:${approval.id}`, { approved: approval.approved, ...(reason ? { reason } : {}) })
  }
  let answered = 0
  const parts = stored.parts.map((p): Part => {
    if (!isToolUIPart(p) || p.state !== "approval-requested" || p.approval.isAutomatic) return p
    const answer = answers.get(`${p.toolCallId}:${p.approval.id}`)
    if (!answer) return p
    answered++
    const reason = answer.reason ?? (answer.approved ? undefined : REFUSED)
    return { ...p, state: "approval-responded", approval: { ...p.approval, approved: answer.approved, ...(reason ? { reason } : {}) } } as Part
  })
  return { message: { ...stored, parts }, answered }
}

/**
 * Before a new question, approvals left without an answer are refused: the call never happens, and the model reads
 * that it was not approved instead of a call without a result.
 */
export function refusePending(message: CopilotMessage): { message: CopilotMessage; refused: number } {
  let refused = 0
  const parts = message.parts.map((p): Part => {
    if (!isToolUIPart(p) || p.state !== "approval-requested" || p.approval.isAutomatic) return p
    refused++
    return { ...p, state: "output-denied", approval: { ...p.approval, approved: false, reason: NOT_ANSWERED } } as Part
  })
  return { message: refused ? { ...message, parts } : message, refused }
}

const dateTime = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })

/**
 * The messages the model reads: the latest ones, starting with a question, each question preceded by where the person
 * was and when (kept out of the instructions so that those stay the same from one turn to the next, and cached).
 * Reasoning is never sent back.
 */
export function forModel(messages: readonly CopilotMessage[]): CopilotMessage[] {
  let recent = messages.slice(-HISTORY_WINDOW)
  const firstQuestion = recent.findIndex((m) => m.role === "user")
  recent = firstQuestion > 0 ? recent.slice(firstQuestion) : recent
  // What older answers read is summed up: the model reads the latest results in full, and calls a tool again if it
  // needs an older one. A long conversation then costs about the same per turn as a short one.
  const answers = recent.filter((m) => m.role === "assistant")
  const fresh = new Set(answers.slice(-FRESH_ANSWERS).map((m) => m.id))
  return recent.map((m) => {
    if (m.role !== "user") {
      const parts = m.parts.filter((p) => p.type !== "reasoning")
      return { ...m, parts: fresh.has(m.id) ? parts : parts.map((p) => (isToolUIPart(p) && p.state === "output-available" ? ({ ...p, output: { [OLD_RESULT]: true, note: "Résultat lu lors d'un tour précédent : appelle de nouveau l'outil si tu en as besoin." } } as Part) : p)) }
    }
    const at = m.metadata?.at ? dateTime.format(new Date(m.metadata.at)) : null
    const where = [at ? `Nous sommes le ${at} (heure de Paris).` : null, m.metadata?.context?.line ?? null].filter(Boolean).join(" ")
    return where ? { ...m, parts: [{ type: "text", text: `[${where}]` }, ...m.parts] } : m
  })
}

/** A short title for the history: the first question, on one line. */
export const titleOf = (text: string) => {
  const line = text.replace(/\s+/g, " ").trim()
  return line.length > 80 ? `${line.slice(0, 79).trimEnd()}…` : line || "Conversation"
}
