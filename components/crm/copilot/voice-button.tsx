"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Mic, Square } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Dictation in the copilot's panel (E28): a click starts recording, a second one stops it (a minute at most); the text
 * comes back in the field, to read before sending. The audio is sent once and never kept. Hidden where the browser has
 * no microphone API.
 */
const MAX_MS = 60_000
const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]

const supported = () => typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"

export function VoiceButton({ onText, onError, disabled }: { onText: (text: string) => void; onError: (message: string | null) => void; disabled?: boolean }) {
  const [available] = useState(supported)
  const [state, setState] = useState<"idle" | "recording" | "sending">("idle")
  const recorder = useRef<MediaRecorder | null>(null)
  const timer = useRef<number | null>(null)

  // Leaving the panel stops a recording in progress and frees the microphone.
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
      const rec = recorder.current
      if (rec && rec.state === "recording") {
        rec.onstop = null
        rec.stop()
        rec.stream.getTracks().forEach((t) => t.stop())
      }
    },
    []
  )

  if (!available) return null

  async function send(blob: Blob) {
    setState("sending")
    try {
      const form = new FormData()
      form.append("audio", blob, "dictee")
      const res = await fetch("/api/ai/transcribe", { method: "POST", body: form })
      const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
      if (!res.ok || !body.text) throw new Error(body.error ?? "La dictée n’a pas abouti.")
      onText(body.text)
    } catch (e) {
      onError(e instanceof Error ? e.message : "La dictée n’a pas abouti.")
    } finally {
      setState("idle")
    }
  }

  async function start() {
    onError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      onError("Micro refusé : autorisez-le pour ce site dans le navigateur.")
      return
    }
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t))
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      if (timer.current) window.clearTimeout(timer.current)
      const blob = new Blob(chunks, { type: rec.mimeType || type || "audio/webm" })
      if (blob.size) void send(blob)
      else setState("idle")
    }
    recorder.current = rec
    rec.start()
    setState("recording")
    timer.current = window.setTimeout(() => {
      if (rec.state === "recording") rec.stop()
    }, MAX_MS)
  }

  const recording = state === "recording"
  return (
    <Button
      type="button"
      size="icon"
      variant={recording ? "destructive" : "ghost"}
      className="h-9 w-9 shrink-0"
      aria-label={recording ? "Arrêter la dictée" : state === "sending" ? "Transcription en cours" : "Dicter votre question"}
      title={recording ? "Arrêter la dictée" : "Dicter (une minute au plus)"}
      aria-pressed={recording}
      disabled={disabled || state === "sending"}
      onClick={() => (recording ? recorder.current?.stop() : void start())}
    >
      {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : recording ? <Square className="h-3.5 w-3.5" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
    </Button>
  )
}
