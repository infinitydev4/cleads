"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { isToolUIPart } from "ai"
import { ArrowUp, History, Loader2, MessageSquarePlus, Sparkles, Square, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatEur } from "@/features/ai/labels"
import { parsePageKind } from "@/features/copilot/page-kind"
import { suggestionsFor } from "@/features/copilot/labels"
import type { ConversationSummary, ConversationView } from "@/features/copilot/conversations"
import type { CopilotMessage } from "@/features/copilot/messages"
import { cn } from "@/lib/utils"
import { Markdown } from "./markdown"
import { LeadChips, ToolPartView, citedLeads } from "./parts"
import { newSession, waitsForApproval, type CopilotSession } from "./copilot"

/** A conversation this recent is offered back on an empty panel. */
const RECENT_MS = 12 * 3600_000

const when = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

const STOPPED: Record<NonNullable<NonNullable<CopilotMessage["metadata"]>["stopped"]>, string> = {
  budget: "Réponse arrêtée : le plafond de ce tour est atteint. Demandez la suite si besoin.",
  steps: "Réponse arrêtée après six étapes : demandez la suite pour qu’il continue.",
  time: "Réponse arrêtée : durée maximale d’un tour atteinte. Demandez la suite pour qu’il continue.",
  aborted: "Réponse interrompue.",
  error: "La réponse n’a pas abouti.",
}

/** The server's message out of a failed request (its JSON), in words for the person. */
function errorMessage(error: Error | undefined): string | null {
  if (!error) return null
  try {
    const body = JSON.parse(error.message) as { error?: string }
    if (body.error) return body.error
  } catch {
    // Not JSON: the message itself.
  }
  return error.message && error.message.length < 300 ? error.message : "Le copilote n’a pas pu répondre. Réessayez dans un instant."
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? "Une erreur est survenue")
  return body as T
}

function Message({ message, onApprove, busy, userId }: { message: CopilotMessage; onApprove: (id: string, approved: boolean) => void; busy: boolean; userId: string | null }) {
  if (message.role === "user") {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n")
    return (
      <div className="ml-8 flex flex-col items-end gap-1">
        <p className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-sidebar px-3.5 py-2 text-sm text-sidebar-foreground">{text}</p>
        {message.metadata?.context?.label && <span className="text-[11px] text-muted-foreground">Depuis : {message.metadata.context.label}</span>}
      </div>
    )
  }
  const stopped = message.metadata?.stopped
  return (
    <div className="mr-4 space-y-2">
      {message.parts.map((part, i) => {
        if (part.type === "text") return part.text.trim() ? <Markdown key={i} text={part.text} /> : null
        if (isToolUIPart(part)) return <ToolPartView key={part.toolCallId} part={part} onApprove={onApprove} busy={busy} userId={userId} />
        return null
      })}
      <LeadChips leads={citedLeads(message)} />
      {stopped && <p className="text-xs text-warning">{STOPPED[stopped]}</p>}
    </div>
  )
}

function HistoryList({ onOpen, onClose }: { onOpen: (id: string) => void; onClose: () => void }) {
  const [items, setItems] = useState<ConversationSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const load = useCallback(() => {
    json<ConversationSummary[]>("/api/ai/conversations")
      .then(setItems)
      .catch((e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  async function remove(id: string | "all") {
    if (confirm !== id) return setConfirm(id)
    setConfirm(null)
    try {
      await json(id === "all" ? "/api/ai/conversations" : `/api/ai/conversations/${id}`, { method: "DELETE" }).catch((e: Error) => {
        // 204 has no body: only a real failure lands here.
        if (e.message !== "Une erreur est survenue") throw e
      })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec")
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <p className="text-sm font-semibold">Conversations</p>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Retour
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {error && <p className="px-2 text-sm text-destructive-text">{error}</p>}
        {!items && !error && <p className="px-2 text-sm text-muted-foreground">Chargement…</p>}
        {items?.length === 0 && <p className="px-2 text-sm text-muted-foreground">Aucune conversation. Elles sont effacées 90 jours après leur dernier message, et avec les fiches qu’elles ont lues.</p>}
        <ul className="space-y-1">
          {items?.map((c) => (
            <li key={c.id} className="group flex items-center gap-1 rounded-lg hover:bg-accent">
              <button type="button" onClick={() => onOpen(c.id)} className="min-w-0 flex-1 px-2 py-2 text-left">
                <span className="block truncate text-sm font-medium">{c.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {when.format(new Date(c.lastMessageAt))}
                  {c.label ? ` · ${c.label}` : ""} · {formatEur(c.costEur)}
                </span>
              </button>
              <Button variant="ghost" size="sm" onClick={() => remove(c.id)} aria-label={confirm === c.id ? "Confirmer la suppression" : `Supprimer « ${c.title} »`} className={cn(confirm === c.id && "text-destructive-text")}>
                {confirm === c.id ? "Supprimer ?" : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
              </Button>
            </li>
          ))}
        </ul>
      </div>
      {!!items?.length && (
        <div className="border-t px-4 py-2">
          <Button variant="ghost" size="sm" onClick={() => remove("all")} className="text-destructive-text">
            {confirm === "all" ? "Confirmer : tout effacer" : "Tout effacer"}
          </Button>
        </div>
      )}
    </div>
  )
}

export function CopilotPanel({
  userId,
  session,
  page,
  pageRef,
  onSession,
  onClose,
}: {
  userId: string | null
  session: CopilotSession
  page: string
  pageRef: { current: string }
  onSession: (s: CopilotSession) => void
  onClose: () => void
}) {
  const { messages, sendMessage, status, stop, error, addToolApprovalResponse, clearError, setMessages } = useChat<CopilotMessage>({ chat: session.chat })
  const [input, setInput] = useState("")
  const [view, setView] = useState<"chat" | "history">("chat")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [recent, setRecent] = useState<ConversationSummary | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const working = status === "submitted" || status === "streaming"
  const waiting = waitsForApproval(messages)
  const kind = parsePageKind(page)
  const cost = messages.reduce((sum, m) => sum + (m.role === "assistant" ? (m.metadata?.costMicros ?? 0) : 0), 0)

  const send = useCallback(
    (text: string) => {
      const question = text.trim()
      if (!question || working || waiting) return
      clearError()
      void sendMessage({ text: question })
      setInput("")
    },
    [working, waiting, sendMessage, clearError]
  )

  useEffect(() => {
    field.current?.focus()
  }, [view])

  // On an empty panel, the last conversation of the day can be picked back up in one click.
  const empty = messages.length === 0 && !session.conversation.current
  useEffect(() => {
    if (!empty) return
    let cancelled = false
    json<ConversationSummary[]>("/api/ai/conversations?limit=1")
      .then(([last]) => {
        if (!cancelled && last && Date.now() - new Date(last.lastMessageAt).getTime() < RECENT_MS) setRecent(last)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [empty])

  // Follow the answer as it streams, unless the person scrolled up to read.
  useEffect(() => {
    const el = scroller.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight
  }, [messages])

  // A request that failed leaves the browser ahead of the server (an approval it did not take): read it back.
  useEffect(() => {
    const id = session.conversation.current
    if (!error || !id) return
    json<ConversationView>(`/api/ai/conversations/${id}`)
      .then((c) => setMessages(c.history))
      .catch(() => {})
  }, [error, session, setMessages])

  async function open(id: string) {
    setLoadError(null)
    try {
      const c = await json<ConversationView>(`/api/ai/conversations/${id}`)
      onSession(newSession(pageRef, { id: c.id, messages: c.history }))
      setView("chat")
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Conversation introuvable")
    }
  }

  const approve = (approvalId: string, approved: boolean) => {
    clearError()
    void addToolApprovalResponse({ id: approvalId, approved })
  }

  return (
    <aside
      aria-label="Copilote"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault()
          onClose()
        }
      }}
      className="crm-shell fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background text-foreground shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-right-8 sm:w-[420px]"
    >
      <header className="flex h-14 shrink-0 items-center gap-1 border-b px-3">
        <Sparkles className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
        <h2 className="ml-1 text-sm font-semibold">Copilote</h2>
        <span className="ml-1 hidden rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground sm:inline">⌘J</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Nouvelle conversation"
            title="Nouvelle conversation"
            disabled={working}
            onClick={() => {
              onSession(newSession(pageRef))
              setView("chat")
            }}
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Conversations" title="Conversations" aria-pressed={view === "history"} onClick={() => setView(view === "history" ? "chat" : "history")}>
            <History className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Fermer le copilote (Échap)" title="Fermer (Échap)" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      {view === "history" ? (
        <HistoryList onOpen={open} onClose={() => setView("chat")} />
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4" aria-live="polite" aria-busy={working}>
          {loadError && <p className="text-sm text-destructive-text">{loadError}</p>}
          {messages.length === 0 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold">Que puis-je faire pour vous ?</p>
                <p className="text-sm text-muted-foreground">
                  Je réponds sur les données du CRM que vous voyez, et je confie l’audit, les offres, les brouillons et les maquettes aux agents spécialisés. Chaque action attend votre validation.
                </p>
              </div>
              {recent && (
                <button type="button" onClick={() => open(recent.id)} className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">Reprendre : {recent.title}</span>
                </button>
              )}
              <ul className="space-y-2">
                {suggestionsFor(kind).map((s) => (
                  <li key={s}>
                    <button type="button" onClick={() => send(s)} className="w-full rounded-lg border bg-card px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {messages.map((m) => (
            <Message key={m.id} message={m} onApprove={approve} busy={working} userId={userId} />
          ))}
          {status === "submitted" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Le copilote réfléchit…
            </p>
          )}
          {error && <p className="rounded-lg border border-destructive/30 bg-destructive-subtle px-3 py-2 text-sm text-destructive-text">{errorMessage(error)}</p>}
        </div>
      )}

      <form
        className="shrink-0 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
          <label htmlFor="copilot-input" className="sr-only">
            Votre question au copilote
          </label>
          <textarea
            id="copilot-input"
            ref={field}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send(input)
              }
            }}
            rows={Math.min(6, Math.max(1, input.split("\n").length))}
            maxLength={4000}
            disabled={view === "history"}
            placeholder={waiting ? "Validez ou refusez l’action proposée…" : "Demandez au copilote…"}
            className="min-h-[36px] flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:outline-none"
          />
          {working ? (
            <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" aria-label="Arrêter la réponse" onClick={() => void stop()}>
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : (
            <Button type="submit" size="icon" className="h-9 w-9 shrink-0" aria-label="Envoyer" disabled={!input.trim() || waiting || view === "history"}>
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
          {waiting ? "Une action attend votre validation." : "Il voit ce que vous voyez ; chaque action attend votre clic."}
          {cost > 0 && ` · ${formatEur(cost / 1_000_000)} pour cette conversation`}
        </p>
      </form>
    </aside>
  )
}
