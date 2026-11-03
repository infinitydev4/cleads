import { gateway, transcribe, type TranscriptionModel } from "ai"
import type { CurrentUser } from "@/lib/auth/guard"
import { aiConfigured } from "@/lib/ai/gateway"
import { getAiSettings } from "@/lib/ai/budget"
import { transcriptionMicros } from "@/lib/ai/pricing"
import { LeadError } from "@/features/leads/errors"
import { finishRun, recordModelStep, startRun } from "@/features/ai/runs"

/**
 * Dictation for the copilot (E28): a question spoken in the panel becomes text the person reads before sending. The
 * audio goes to the Gateway's transcription (Voxtral, a European provider, prompts never used for training) and is
 * never stored. Each dictation is a short run of the copilot, so it counts in the person's quota like the rest.
 */
export const TRANSCRIBE_MODEL = "mistral/voxtral-mini-transcribe-3"
export const MAX_AUDIO_BYTES = 2_000_000
export const MAX_AUDIO_SECONDS = 60
const TIMEOUT_MS = 30_000
const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)(;|$)/

export interface TranscribeDeps {
  transcriptionModel?: TranscriptionModel
}

export async function transcribeFor(user: CurrentUser, audio: { bytes: Uint8Array; type: string }, deps: TranscribeDeps = {}): Promise<{ text: string }> {
  if (!deps.transcriptionModel && !aiConfigured()) throw new LeadError("unavailable", "L'IA n'est pas configurée sur ce serveur : la dictée est indisponible.", 503)
  if (!AUDIO_TYPES.test(audio.type)) throw new LeadError("invalid", "Format audio non pris en charge.", 400)
  if (!audio.bytes.length) throw new LeadError("invalid", "Aucun son reçu.", 400)
  if (audio.bytes.length > MAX_AUDIO_BYTES) throw new LeadError("invalid", "Dictée trop longue : une minute au plus.", 400)

  const run = await startRun(user, { agentId: "copilot", status: "RUNNING", input: { kind: "transcription" } })
  const started = Date.now()
  try {
    const result = await transcribe({
      model: deps.transcriptionModel ?? gateway.transcriptionModel(TRANSCRIBE_MODEL),
      audio: audio.bytes,
      providerOptions: { gateway: { disallowPromptTraining: true, user: run.userKey, tags: ["agent:copilot", "dictee"] } },
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const text = result.text.trim().slice(0, 4_000)
    // Billed on the audio's length, as heard by the model; a missing length counts as the longest allowed.
    const seconds = Math.min(result.durationInSeconds ?? MAX_AUDIO_SECONDS, MAX_AUDIO_SECONDS)
    const { eurPerUsd } = await getAiSettings(user.workspaceId)
    await recordModelStep(run, {
      type: "MODEL",
      name: "dictee",
      model: TRANSCRIBE_MODEL,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      micros: transcriptionMicros(TRANSCRIBE_MODEL, seconds, eurPerUsd),
      durationMs: Date.now() - started,
      output: { seconds, characters: text.length },
    })
    await finishRun(run.id, { status: "SUCCEEDED", output: { seconds, characters: text.length } })
    if (!text) throw new LeadError("invalid", "Rien n'a été compris : réessayez plus près du micro.", 400)
    return { text }
  } catch (error) {
    await finishRun(run.id, { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 300) : "Échec de la dictée" })
    if (error instanceof LeadError) throw error
    throw new LeadError("unavailable", "La dictée n'a pas abouti : réessayez dans un instant, ou tapez votre question.", 503)
  }
}
