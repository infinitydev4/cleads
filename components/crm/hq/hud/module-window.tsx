"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ExternalLink, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { footerItems, iconFallback, navGroups, paletteActions } from "@/lib/crm/nav"
import { WINDOW_MESSAGE, WINDOW_PARAM, closeHqWindow, followHqWindow, forgetHqWindowEntry, openHqWindow, windowPath, type WindowMessage } from "@/lib/crm/hq-window"
import { useHqStore } from "../store"

/**
 * The windows of the 3D view (lib/crm/hq-window.ts): a CRM page over the scene, the scene resting behind it. The page
 * inside is the 2D page itself, without its shell, so every module (search, import, pipeline, agenda, campaigns…)
 * works in 3D exactly as in 2D.
 */

const ITEMS = [...navGroups.flatMap((g) => g.items), ...paletteActions, ...footerItems]

/** The module a page belongs to, for the window's icon, and its title until the page gives its own. */
function moduleOf(path: string) {
  const pathname = path.split("?")[0]
  return ITEMS.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]
}

/** "Pipeline · Cleads CRM" → "Pipeline". */
const shortTitle = (title: string) => title.replace(/\s·\sCleads CRM$/, "").trim()

/**
 * Links anywhere in the 3D view (panels, top bar, a fiche's sheet) that lead to a CRM page open it in a window instead
 * of leaving the view. Left alone: new tabs (modifier keys), downloads, other sites, and links marked data-hq-leave
 * ("2D", "Ouvrir en 2D").
 */
export function useWindowLinks() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download") || link.closest("[data-hq-leave]")) return
      const path = windowPath(link.getAttribute("href"), window.location.origin)
      if (!path) return
      // Prevented, not stopped: Next's <Link> then leaves the click alone, and the handlers around still run.
      e.preventDefault()
      // A link inside a dialog or a sheet (a fiche's "Ouvrir en pleine page"): it closes first, as with Échap, or it
      // would keep the focus and the clicks while the window opens behind it.
      link.closest('[role="dialog"]:not([data-hq-window]), [role="alertdialog"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
      openHqWindow(path)
    }
    window.addEventListener("click", onClick, true)
    return () => window.removeEventListener("click", onClick, true)
  }, [])
}

interface Shown {
  /** Where the page inside is now (it may have moved since the window opened). */
  path: string
  title: string
  /** Pages were visited inside the window: they share the tab's history. */
  visited: boolean
}

/** The window the address asks for (?w=…), above the HUD. `onClosed` runs when it closes, to refresh the figures. */
export function ModuleWindow({ onClosed }: { onClosed: () => void }) {
  const store = useHqStore()
  const params = useSearchParams()
  const requested = windowPath(params.get(WINDOW_PARAM))
  const iframe = useRef<HTMLIFrameElement>(null)
  const [frame, setFrame] = useState(requested ? { src: requested, key: 0 } : null)
  const [shown, setShown] = useState<Shown | null>(null)
  const [loading, setLoading] = useState(!!requested)
  const [last, setLast] = useState(requested)
  if (requested !== last) {
    // The address changed: closed (back button) or another page asked for. When it only follows a navigation inside
    // the window (followHqWindow), the page is already there and the frame stays as it is.
    setLast(requested)
    if (!requested) {
      setFrame(null)
      setShown(null)
    } else if (requested !== shown?.path) {
      setFrame({ src: requested, key: (frame?.key ?? 0) + 1 })
      setShown(null)
      setLoading(true)
    }
  }
  const open = frame !== null
  const visited = !!shown?.visited
  const close = useCallback(() => closeHqWindow({ visited }), [visited])

  // While a window is open the scene rests (no frames drawn), its keys and HUD are off; on closing, the figures are
  // refreshed (something may have changed in the window) and the focus goes back where it was.
  useEffect(() => {
    if (!open) return
    store.set({ covered: true })
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      forgetHqWindowEntry()
      store.set({ covered: false })
      opener?.focus()
      onClosed()
    }
  }, [open, store, onClosed])

  // Messages from the page inside: where it is, what it is called, "close".
  useEffect(() => {
    if (!open) return
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== iframe.current?.contentWindow) return
      const message = e.data as WindowMessage | null
      if (message?.source !== WINDOW_MESSAGE) return
      if (message.type === "close") {
        close()
        return
      }
      const path = windowPath(message.path)
      setLoading(false)
      setShown((prev) => ({ path: path ?? prev?.path ?? "", title: message.title, visited: !!prev && (prev.visited || (!!path && path !== prev.path)) }))
      if (path && path !== windowPath(new URLSearchParams(window.location.search).get(WINDOW_PARAM))) followHqWindow(path)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [open, close])

  // Échap with the focus on the window's own bar (inside the page, the page itself asks to close).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length === 1) {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, close])

  if (!frame) return null
  const here = shown?.path || frame.src
  const entry = moduleOf(here)
  const Icon = entry?.icon ?? iconFallback
  const title = shown?.title ? shortTitle(shown.title) : (entry?.label ?? "Cleads CRM")
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex justify-center bg-sidebar/35 backdrop-blur-[3px] duration-200 animate-in fade-in-0 sm:p-4 lg:px-8 lg:py-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="hq-window-title"
        data-hq-window
        className="flex w-full max-w-[1320px] flex-col overflow-hidden bg-background shadow-pop duration-200 animate-in zoom-in-95 sm:rounded-2xl sm:border sm:border-white/70"
      >
        <header className="relative flex h-12 shrink-0 items-center gap-2 border-b bg-card px-2 sm:gap-3 sm:px-3">
          {/* The lime thread of the scene, under the bar. */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-8 -bottom-px h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/25 text-sidebar"><Icon className="h-4 w-4" aria-hidden="true" /></span>
          <h2 id="hq-window-title" className="min-w-0 flex-1 truncate text-sm font-extrabold tracking-[-0.02em]">{title}</h2>
          <span className="hidden text-[11px] font-medium text-muted-foreground lg:inline">Vue 3D · Échap pour y revenir</span>
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href={here} data-hq-leave>Ouvrir en 2D <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link>
          </Button>
          <button type="button" onClick={close} aria-label="Fermer et revenir à la vue 3D (Échap)" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div className="relative min-h-0 flex-1">
          <iframe
            key={frame.key}
            ref={iframe}
            src={frame.src}
            title={title}
            allow="clipboard-write"
            className="h-full w-full border-0 bg-background"
            onLoad={() => {
              setLoading(false)
              iframe.current?.focus()
            }}
          />
          {loading && (
            <div className="absolute inset-0 grid place-items-center bg-background">
              <p className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-medium shadow-pop"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Ouverture…</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
