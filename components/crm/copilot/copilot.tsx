"use client"

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { Chat } from "@ai-sdk/react"
import { DefaultChatTransport, isToolUIPart, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai"
import { Sparkles } from "lucide-react"
import { can } from "@/lib/rbac"
import type { CrmRole } from "@/lib/crm/roles"
import { HQ_PATH, WINDOW_PARAM } from "@/lib/crm/hq-window"
import type { CopilotMessage } from "@/features/copilot/messages"
import { cn } from "@/lib/utils"
import { CopilotPanel } from "./panel"

/**
 * The copilot everywhere in the CRM (E24): ⌘J, the button of the top bar or the palette open a panel on the right, in
 * 2D as in the 3D view. It knows the page it sits on (in the 3D view, the open window's), keeps its conversation while
 * the person moves from page to page, and links to fiches open in the 3D view's windows like any other link there.
 */

/** Dispatched on the window to open or close the panel: a page in a window of the 3D view asks through its frame. */
export const COPILOT_EVENT = "cleads-copilot"

interface CopilotState {
  available: boolean
  open: boolean
  toggle: (open?: boolean) => void
  /** Opens the panel and asks this question in the current conversation. */
  ask: (text: string) => void
}

const CopilotContext = createContext<CopilotState>({ available: false, open: false, toggle: () => {}, ask: () => {} })
export const useCopilot = () => useContext(CopilotContext)

export interface CopilotSession {
  chat: Chat<CopilotMessage>
  /** Server id of the conversation; null until the first answer of a new one. */
  conversation: { current: string | null }
}

let sequence = 0

/** The last answer waits for the person to approve or refuse an action. */
export const waitsForApproval = (messages: readonly CopilotMessage[]) => {
  const last = messages.at(-1)
  return last?.role === "assistant" && last.parts.some((p) => isToolUIPart(p) && p.state === "approval-requested" && !p.approval.isAutomatic)
}

/** A chat bound to one conversation. The server keeps the history: the browser only sends the new question, or answers. */
export function newSession(page: { current: string }, from?: { id: string; messages: CopilotMessage[] }): CopilotSession {
  const conversation = { current: from?.id ?? null }
  const chat = new Chat<CopilotMessage>({
    id: from?.id ?? `nouvelle-${++sequence}`,
    messages: from?.messages ?? [],
    transport: new DefaultChatTransport<CopilotMessage>({
      api: "/api/ai/chat",
      prepareSendMessagesRequest: ({ messages }) => ({ body: { conversationId: conversation.current, message: messages[messages.length - 1], page: page.current } }),
      fetch: async (input, init) => {
        const res = await fetch(input, init)
        const id = res.headers.get("x-copilot-conversation")
        if (id) conversation.current = id
        return res
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  })
  return { chat, conversation }
}

/** The page the panel sits on: the address, or in the 3D view the address of the open window. */
function PageTracker({ onPage }: { onPage: (path: string) => void }) {
  const pathname = usePathname()
  const params = useSearchParams()
  useEffect(() => {
    const window = pathname === HQ_PATH ? params.get(WINDOW_PARAM) : null
    onPage(window ?? `${pathname}${params.size ? `?${params}` : ""}`)
  }, [pathname, params, onPage])
  return null
}

export function CopilotProvider({ user, children }: { user: { id?: string; role: CrmRole }; children: React.ReactNode }) {
  const available = !!user.id && can(user.role, "ai:use")
  const [open, setOpen] = useState(false)
  const page = useRef("/app")
  const [pagePath, setPagePath] = useState("/app")
  const [session, setSessionState] = useState<CopilotSession | null>(null)
  const sessionRef = useRef<CopilotSession | null>(null)
  const setSession = useCallback((s: CopilotSession) => {
    sessionRef.current = s
    setSessionState(s)
  }, [])

  const onPage = useCallback((path: string) => {
    page.current = path
    setPagePath(path)
  }, [])

  // The conversation starts the first time the panel opens, then lives as long as the CRM tab.
  const toggleOpen = useCallback(
    (next?: boolean) => {
      if (!available) return
      if (!sessionRef.current) setSession(newSession(page))
      setOpen((o) => next ?? !o)
    },
    [available, setSession]
  )

  const ask = useCallback(
    (text: string) => {
      const question = text.trim()
      if (!available || !question) return
      // In the current conversation when it is free; in a new one while it answers or waits for an approval.
      let s = sessionRef.current
      if (!s || s.chat.status === "submitted" || s.chat.status === "streaming" || waitsForApproval(s.chat.messages)) s = newSession(page)
      setSession(s)
      void s.chat.sendMessage({ text: question })
      setOpen(true)
    },
    [available, setSession]
  )

  // ⌘J / Ctrl+J from anywhere, and the same request from a page in a window of the 3D view.
  useEffect(() => {
    if (!available) return
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "j") {
        event.preventDefault()
        toggleOpen()
      }
    }
    const onEvent = () => toggleOpen()
    window.addEventListener("keydown", onKey)
    window.addEventListener(COPILOT_EVENT, onEvent)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(COPILOT_EVENT, onEvent)
    }
  }, [available, toggleOpen])

  const state = useMemo(() => ({ available, open, toggle: toggleOpen, ask }), [available, open, toggleOpen, ask])
  return (
    <CopilotContext.Provider value={state}>
      {children}
      {available && (
        <Suspense>
          <PageTracker onPage={onPage} />
        </Suspense>
      )}
      {available && open && session && (
        <CopilotPanel
          userId={user.id ?? null}
          session={session}
          page={pagePath}
          pageRef={page}
          onSession={setSession}
          onClose={() => setOpen(false)}
        />
      )}
    </CopilotContext.Provider>
  )
}

/** The top bar's button. */
export function CopilotButton({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const { available, open, toggle } = useCopilot()
  if (!available) return null
  return (
    <button
      type="button"
      onClick={() => toggle()}
      aria-pressed={open}
      aria-label="Copilote (⌘J)"
      title="Copilote (⌘J)"
      className={cn(
        "grid h-9 w-9 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tone === "dark" ? "text-sidebar-foreground hover:bg-sidebar-accent" : "text-foreground hover:bg-accent",
        open && (tone === "dark" ? "bg-sidebar-accent" : "bg-accent"),
        className
      )}
    >
      <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  )
}
