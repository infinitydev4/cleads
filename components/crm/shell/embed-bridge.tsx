"use client"

import { useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { HQ_PATH, WINDOW_MESSAGE, type WindowMessageBody } from "@/lib/crm/hq-window"

// Something of the page's own is open (dialog, menu, list): Échap is for it, not for the window.
const OPEN_LAYERS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]'

function post(message: WindowMessageBody) {
  window.parent.postMessage({ source: WINDOW_MESSAGE, ...message }, window.location.origin)
}

/**
 * Runs in a CRM page shown in a window of the 3D view (lib/crm/hq-window.ts). Tells the view where the page is and what
 * it is called, so the window's title and address follow it, and asks the view to close the window on Échap or when a
 * link leads back to the 3D view (which would otherwise open inside its own window), or to open its copilot on ⌘J.
 */
export function EmbedBridge() {
  const pathname = usePathname()
  const params = useSearchParams()
  const path = `${pathname}${params.size ? `?${params}` : ""}`

  useEffect(() => {
    const send = () => post({ type: "location", path, title: document.title })
    send()
    // The title of the page changes a moment after its address.
    const watcher = new MutationObserver(send)
    watcher.observe(document.head, { subtree: true, childList: true, characterData: true })
    return () => watcher.disconnect()
  }, [path])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector(OPEN_LAYERS)) post({ type: "close" })
      // ⌘J: the copilot lives in the view around the window (E24).
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "j") {
        e.preventDefault()
        post({ type: "copilot" })
      }
    }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = (e.target as Element | null)?.closest?.("a[href]")
      if (!link) return
      const url = new URL(link.getAttribute("href")!, window.location.href)
      if (url.origin === window.location.origin && url.pathname === HQ_PATH) {
        e.preventDefault()
        post({ type: "close" })
      }
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("click", onClick, true)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("click", onClick, true)
    }
  }, [])

  return null
}
