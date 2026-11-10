import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * ElevenLabs Agents (E33): the voice of the AI caller. https://elevenlabs.io/docs/eleven-agents
 * The key lives in ELEVENLABS_API_KEY and the post-call webhook's secret in ELEVENLABS_WEBHOOK_SECRET, never in the
 * database. The number the agent calls from is the Zadarma line imported in ElevenLabs as a SIP trunk.
 */
const API = process.env.ELEVENLABS_API_URL || "https://api.elevenlabs.io"

export class ElevenLabsError extends Error {
  constructor(
    public readonly kind: "not_configured" | "unreachable" | "refused" | "bad_response",
    message: string,
    public readonly status?: number
  ) {
    super(message)
  }
}

export const elevenLabsConfigured = () => Boolean(process.env.ELEVENLABS_API_KEY)

async function call<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown, timeoutMs = 20_000): Promise<T> {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new ElevenLabsError("not_configured", "La clé ElevenLabs n’est pas configurée.")
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { "xi-api-key": key, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new ElevenLabsError("unreachable", "ElevenLabs ne répond pas.")
  }
  const text = await res.text()
  if (!res.ok) {
    // The detail is ElevenLabs' own words (never the key): kept for the logs and the error shown to the owner.
    const detail = text.slice(0, 300)
    throw new ElevenLabsError("refused", res.status === 401 ? "ElevenLabs refuse la clé." : `ElevenLabs a refusé la demande (${res.status}) : ${detail}`, res.status)
  }
  try {
    return (text ? JSON.parse(text) : {}) as T
  } catch {
    throw new ElevenLabsError("bad_response", "Réponse illisible d’ElevenLabs.")
  }
}

// ── Calls ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface OutboundCall {
  agentId: string
  phoneNumberId: string
  to: string
  dynamicVariables: Record<string, string | number | boolean>
  /** Per-call prompt, first message, language and voice (the agent allows these overrides). */
  override: { prompt: string; firstMessage: string; language: string; voiceId?: string | null }
}

/** POST /v1/convai/sip-trunk/outbound-call: the agent dials `to` from the imported SIP number. */
export async function placeCall(c: OutboundCall): Promise<{ conversationId: string | null; sipCallId: string | null }> {
  const r = await call<{ success: boolean; message: string; conversation_id?: string | null; sip_call_id?: string | null }>("POST", "/v1/convai/sip-trunk/outbound-call", {
    agent_id: c.agentId,
    agent_phone_number_id: c.phoneNumberId,
    to_number: c.to,
    conversation_initiation_client_data: {
      dynamic_variables: c.dynamicVariables,
      conversation_config_override: {
        agent: { prompt: { prompt: c.override.prompt }, first_message: c.override.firstMessage, language: c.override.language },
        ...(c.override.voiceId ? { tts: { voice_id: c.override.voiceId } } : {}),
      },
    },
    telephony_call_config: { ringing_timeout_secs: 30 },
  })
  if (!r.success) throw new ElevenLabsError("refused", r.message || "L’appel n’a pas pu partir.")
  return { conversationId: r.conversation_id ?? null, sipCallId: r.sip_call_id ?? null }
}

/** The conversation's audio (MP3), streamed to whoever listens in Cleads. */
export async function conversationAudio(conversationId: string): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new ElevenLabsError("not_configured", "La clé ElevenLabs n’est pas configurée.")
  try {
    return await fetch(`${API}/v1/convai/conversations/${encodeURIComponent(conversationId)}/audio`, { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(30_000) })
  } catch {
    throw new ElevenLabsError("unreachable", "ElevenLabs ne répond pas.")
  }
}

// ── Setup ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PhoneNumber {
  id: string
  number: string
  label: string
  provider: string
}

export async function listPhoneNumbers(): Promise<PhoneNumber[]> {
  const rows = await call<{ phone_number_id: string; phone_number: string; label?: string | null; provider?: string | null }[]>("GET", "/v1/convai/phone-numbers")
  return (Array.isArray(rows) ? rows : []).map((r) => ({ id: r.phone_number_id, number: r.phone_number, label: r.label ?? "", provider: r.provider ?? "" }))
}

export interface Voice {
  id: string
  name: string
  description: string
  previewUrl: string | null
}

/** The account's voices (premade and added), French ones first. */
export async function listVoices(): Promise<Voice[]> {
  const r = await call<{ voices?: { voice_id: string; name: string; preview_url?: string | null; labels?: Record<string, string> | null; description?: string | null; verified_languages?: { language?: string }[] | null }[] }>("GET", "/v1/voices")
  const voices = (r.voices ?? []).map((v) => {
    const labels = v.labels ?? {}
    const french = (v.verified_languages ?? []).some((l) => l.language === "fr") || /fran|french/i.test(`${labels.accent ?? ""} ${labels.language ?? ""}`)
    return { french, voice: { id: v.voice_id, name: v.name, description: [labels.gender, labels.accent, labels.description ?? labels.descriptive, v.description].filter(Boolean).join(" · ").slice(0, 160), previewUrl: v.preview_url ?? null } }
  })
  return [...voices.filter((v) => v.french), ...voices.filter((v) => !v.french)].map((v) => v.voice)
}

export interface ToolSpec {
  name: string
  description: string
  url: string
  /** LLM-filled parameters; `call_token` is added and filled from the dynamic variable of the same name. */
  params: Record<string, { type: "string" | "boolean"; description: string }>
  required?: string[]
}

/** Creates a server tool (webhook) and answers its id. */
export async function createTool(t: ToolSpec): Promise<string> {
  const r = await call<{ id: string }>("POST", "/v1/convai/tools", {
    tool_config: {
      type: "webhook",
      name: t.name,
      description: t.description,
      response_timeout_secs: 20,
      api_schema: {
        url: t.url,
        method: "POST",
        request_body_schema: {
          type: "object",
          properties: { call_token: { type: "string", dynamic_variable: "call_token" }, ...t.params },
          required: ["call_token", ...(t.required ?? [])],
        },
      },
    },
  })
  if (!r.id) throw new ElevenLabsError("bad_response", "ElevenLabs n’a pas donné l’identifiant de l’outil.")
  return r.id
}

export interface AgentSpec {
  name: string
  prompt: string
  firstMessage: string
  voiceId?: string | null
  toolIds: string[]
  /** Fields ElevenLabs extracts from each transcript (analysis.data_collection_results). */
  dataCollection: Record<string, { type: "string" | "boolean"; description: string }>
}

/** Creates the agent, with the per-call overrides Cleads uses allowed. */
export async function createAgent(a: AgentSpec): Promise<string> {
  const r = await call<{ agent_id: string }>("POST", "/v1/convai/agents/create", {
    name: a.name,
    tags: ["cleads"],
    conversation_config: {
      agent: {
        first_message: a.firstMessage,
        language: "fr",
        prompt: {
          prompt: a.prompt,
          tool_ids: a.toolIds,
          built_in_tools: {
            end_call: { name: "end_call", description: "", params: { system_tool_type: "end_call" } },
            voicemail_detection: { name: "voicemail_detection", description: "Raccroche si une messagerie répond, sans laisser de message.", params: { system_tool_type: "voicemail_detection", voicemail_message: null } },
          },
        },
      },
      ...(a.voiceId ? { tts: { voice_id: a.voiceId } } : {}),
      conversation: { max_duration_seconds: 240 },
    },
    platform_settings: {
      overrides: { conversation_config_override: { agent: { first_message: true, language: true, prompt: { prompt: true } }, tts: { voice_id: true } } },
      data_collection: a.dataCollection,
    },
  })
  if (!r.agent_id) throw new ElevenLabsError("bad_response", "ElevenLabs n’a pas donné l’identifiant de l’agent.")
  return r.agent_id
}

// ── Post-call webhook ──────────────────────────────────────────────────────────────────────────────────────────

/** Old signatures are refused: a captured request cannot be replayed later. */
export const SIGNATURE_TOLERANCE_SEC = 30 * 60

/** `ElevenLabs-Signature: t=<unix>,v0=<hex HMAC-SHA256 of "<t>.<raw body>">`, as the SDK's constructEvent checks it. */
export function verifySignature(rawBody: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!header) return false
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]))
  const t = Number(parts.t)
  const given = parts.v0
  if (!Number.isFinite(t) || !given || Math.abs(nowSec - t) > SIGNATURE_TOLERANCE_SEC) return false
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex")
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function signPayload(rawBody: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): string {
  return `t=${nowSec},v0=${createHmac("sha256", secret).update(`${nowSec}.${rawBody}`).digest("hex")}`
}
