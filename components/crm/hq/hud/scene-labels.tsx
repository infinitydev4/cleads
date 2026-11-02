"use client"

import { useCallback } from "react"
import { Lock } from "lucide-react"
import { ZONES } from "@/features/hq/zones"
import { ROLE_LABELS } from "@/lib/crm/roles"
import { cn } from "@/lib/utils"
import { ZONE_ICONS } from "../zone-icons"
import { selectZone, useHq, useHqStore } from "../store"

/** Registers an element for the scene to place (components/crm/hq/scene/labels.tsx, LabelProjector). */
function useAnchor(key: string) {
  const store = useHqStore()
  return useCallback(
    (el: HTMLElement | null) => {
      if (el) store.labels.set(key, el)
      else store.labels.delete(key)
    },
    [store, key]
  )
}

function ZoneLabel({ id }: { id: (typeof ZONES)[number]["id"] }) {
  const store = useHqStore()
  const zone = ZONES.find((z) => z.id === id)!
  const summary = useHq((s) => s.overview.zones[id])
  const active = useHq((s) => s.selection?.kind === "zone" && s.selection.id === id)
  const hovered = useHq((s) => s.hovered === id)
  const faded = useHq((s) => s.focus !== null && s.focus !== id)
  const ref = useAnchor(`zone:${id}`)
  const Icon = ZONE_ICONS[id]
  return (
    <button
      ref={ref}
      type="button"
      style={{ visibility: "hidden" }}
      onClick={() => selectZone(store, id)}
      onMouseEnter={() => store.set({ hovered: id })}
      onMouseLeave={() => store.get().hovered === id && store.set({ hovered: null })}
      aria-pressed={active}
      aria-label={`${zone.label}${summary.badge ? `, ${summary.badge}` : ""}${summary.locked ? ", accès réservé" : ""}. Touche ${zone.key}.`}
      className={cn(
        "pointer-events-auto absolute left-0 top-0 flex select-none items-center gap-2 whitespace-nowrap rounded-xl bg-sidebar py-1.5 pl-1.5 pr-3 text-left text-sidebar-foreground shadow-pop ring-2 transition-[opacity,box-shadow] will-change-transform focus-visible:outline-none focus-visible:ring-primary",
        active || hovered ? "z-[2] ring-primary" : "ring-transparent",
        faded && !active ? "opacity-60" : "opacity-100"
      )}
    >
      <span className={cn("grid h-7 w-7 place-items-center rounded-lg", summary.locked ? "bg-sidebar-accent text-sidebar-muted" : "bg-primary text-primary-foreground")}>
        {summary.locked ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
      </span>
      <span className="leading-tight">
        <span className="block text-[13px] font-bold">{zone.label}</span>
        {summary.badge && (
          <span className={cn("block text-[11px] font-medium", summary.tone === "attention" ? "text-[#f0b44a]" : summary.tone === "active" ? "text-primary" : "text-sidebar-muted")}>
            {summary.tone === "attention" && "● "}
            {summary.badge}
          </span>
        )}
      </span>
    </button>
  )
}

/** The name of the person under the pointer or selected, above their head. */
function MemberLabel() {
  const ref = useAnchor("member")
  const member = useHq((s) => {
    const id = s.selection?.kind === "member" ? s.selection.id : s.hovered
    return s.overview.members.find((m) => m.id === id) ?? null
  })
  return (
    <div ref={ref} style={{ visibility: "hidden" }} className="pointer-events-none absolute left-0 top-0 will-change-transform" aria-hidden="true">
      {member && (
        <div className="whitespace-nowrap rounded-lg bg-[#1f4fc4] px-2.5 py-1 text-xs font-semibold text-white shadow-pop">
          {member.name} <span className="font-normal opacity-80">· {member.status === "meeting" ? "En rendez-vous" : ROLE_LABELS[member.role]}</span>
        </div>
      )}
    </div>
  )
}

/** Labels of the spaces, as real buttons over the scene (Tab, Enter): the scene works without a mouse. */
export function SceneLabels() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" role="group" aria-label="Espaces du QG">
      {ZONES.map((z) => <ZoneLabel key={z.id} id={z.id} />)}
      <MemberLabel />
    </div>
  )
}
