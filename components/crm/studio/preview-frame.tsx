"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLink, Loader2, Monitor, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils"

const DESKTOP_WIDTH = 1440

/**
 * A version shown inside the CRM (E23): the page in a sandboxed frame (no script, no same-origin access, links open
 * outside), at its real width on a computer, scaled down to fit, or at 390 px in a phone outline.
 */
export function PreviewFrame({ src, title, publicUrl, className }: { src: string; title: string; publicUrl?: string | null; className?: string }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [loaded, setLoaded] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(960)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const scale = Math.min(width / DESKTOP_WIDTH, 1)
  const height = 640
  const key = `${src}:${device}`
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Appareil" className="inline-flex rounded-lg border bg-card p-0.5">
          {(
            [
              ["desktop", Monitor, "Ordinateur"],
              ["mobile", Smartphone, "Téléphone"],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={device === value}
              onClick={() => setDevice(value)}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", device === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        {publicUrl && (
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Ouvrir le lien public <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
      </div>

      <div ref={box} className="relative">
        {loaded !== key && (
          <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-muted/60" aria-hidden="true">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" />
          </div>
        )}
        {device === "desktop" ? (
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-center gap-1.5 border-b bg-muted/60 px-3 py-2" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
              <span className="ml-3 truncate rounded bg-card px-2 py-0.5 text-[11px] text-muted-foreground">{publicUrl ?? "aperçu interne"}</span>
            </div>
            <div style={{ height }} className="relative overflow-hidden">
              <iframe
                key={key}
                src={src}
                title={`${title} : aperçu sur ordinateur`}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                onLoad={() => setLoaded(key)}
                className="absolute left-0 top-0 origin-top-left border-0 bg-white"
                style={{ width: DESKTOP_WIDTH, height: height / scale, transform: `scale(${scale})` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex justify-center overflow-x-auto rounded-xl border bg-muted/40 px-2 py-6">
            <div className="overflow-hidden rounded-[2.25rem] border-[10px] border-sidebar bg-white shadow-lg">
              <iframe
                key={key}
                src={src}
                title={`${title} : aperçu sur téléphone`}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                onLoad={() => setLoaded(key)}
                className="block border-0 bg-white"
                style={{ width: 390, height: Math.min(height + 120, 780) }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
