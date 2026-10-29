"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core"
import { toast } from "sonner"
import { CalendarClock, GripVertical, MoveRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StatusBadge } from "@/components/crm/status-badge"
import { dealStage } from "@/lib/crm/status"
import { ago, euros, formatDate, formatDateTime } from "@/lib/crm/format"
import { cn } from "@/lib/utils"
import { STAGES } from "@/features/pipeline/rules"
import type { BoardDeal } from "@/features/pipeline/service"
import type { DealStage } from "@prisma/client"
import { api } from "../leads/api"
import { personName, type Assignee } from "../leads/filter-bar"
import { LeadPanel } from "../leads/lead-panel"
import { LostDialog } from "../leads/lost-dialog"

const ANY = "__any__"

interface Props {
  deals: BoardDeal[]
  filters: { owner?: string; q?: string }
  assignees: Assignee[]
  currentUserId: string
  canSeeOthers: boolean
}

export function PipelineBoard({ deals: initial, filters, assignees, currentUserId, canSeeOthers }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()
  const [deals, setDeals] = useState(initial)
  const [openLead, setOpenLead] = useState<string | null>(null)
  const [dragging, setDragging] = useState<BoardDeal | null>(null)
  const [losing, setLosing] = useState<BoardDeal | null>(null)
  const [q, setQ] = useState(filters.q ?? "")
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor))

  // The server is the source of truth: take its list again after any refresh.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- adopting the freshly rendered server data is the purpose of this effect
  useEffect(() => setDeals(initial), [initial])

  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s, [] as BoardDeal[]])) as Record<DealStage, BoardDeal[]>
    for (const d of deals) map[d.stage].push(d)
    return map
  }, [deals])

  function setFilter(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }))
  }
  useEffect(() => {
    if ((filters.q ?? "") === q) return
    const t = setTimeout(() => setFilter({ q: q || undefined }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  /** Optimistic: the card moves at once, and goes back with the server's reason if the move is refused. */
  async function move(deal: BoardDeal, stage: DealStage, extra: object = {}) {
    if (deal.stage === stage) return
    if (stage === "LOST" && !("lostReason" in extra)) return setLosing(deal)
    const before = deals
    setDeals((all) => all.map((d) => (d.id === deal.id ? { ...d, stage } : d)))
    try {
      const updated = await api<BoardDeal>(`/api/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify({ stage, ...extra }) })
      setDeals((all) => all.map((d) => (d.id === deal.id ? updated : d)))
      if (stage === "WON") toast.success(`${deal.name} : gagnée`)
    } catch (e) {
      setDeals(before)
      toast.error(e instanceof Error ? e.message : "Déplacement refusé")
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null)
    const deal = deals.find((d) => d.id === event.active.id)
    const stage = event.over?.id as DealStage | undefined
    if (deal && stage) void move(deal, stage)
  }
  const onDragStart = (event: DragStartEvent) => setDragging(deals.find((d) => d.id === event.active.id) ?? null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une entreprise…" aria-label="Rechercher une opportunité" className="max-w-xs" />
        <Select value={filters.owner ?? ANY} onValueChange={(v) => setFilter({ owner: v === ANY ? undefined : v })}>
          <SelectTrigger className="w-52" aria-label="Responsable"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Toutes les opportunités</SelectItem>
            <SelectItem value="me">Mes opportunités</SelectItem>
            <SelectItem value="none">À attribuer</SelectItem>
            {canSeeOthers && assignees.filter((a) => ["CLOSER", "MANAGER", "OWNER"].includes(a.role)).map((a) => <SelectItem key={a.id} value={a.id}>{personName(a)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="grid min-w-[1180px] grid-cols-6 gap-3">
            {STAGES.map((stage) => (
              <Column key={stage} stage={stage} deals={byStage[stage]} onOpen={setOpenLead} onMove={move} activeStage={dragging?.stage} />
            ))}
          </div>
        </div>
        <DragOverlay>{dragging && <CardBody deal={dragging} overlay />}</DragOverlay>
      </DndContext>

      <LostDialog
        key={losing?.id ?? "none"}
        name={losing?.name ?? ""}
        open={!!losing}
        onCancel={() => setLosing(null)}
        onConfirm={(reason, detail) => {
          const deal = losing!
          setLosing(null)
          void move(deal, "LOST", { lostReason: reason, lostDetail: detail || undefined })
        }}
      />
      <LeadPanel id={openLead} assignees={assignees} currentUserId={currentUserId} onClose={() => { setOpenLead(null); router.refresh() }} />
    </div>
  )
}

function Column({ stage, deals, onOpen, onMove, activeStage }: { stage: DealStage; deals: BoardDeal[]; onOpen: (leadId: string) => void; onMove: (d: BoardDeal, s: DealStage) => void; activeStage?: DealStage }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const withAmount = deals.filter((d) => d.amountCents != null)
  const total = withAmount.reduce((s, d) => s + (d.amountCents ?? 0), 0)
  const closed = stage === "WON" || stage === "LOST"
  return (
    <section ref={setNodeRef} aria-label={`Colonne ${dealStage[stage].label}`} className={cn("flex min-h-[420px] flex-col rounded-2xl border bg-muted/40 p-2 transition-colors", isOver && activeStage !== stage && "border-foreground bg-accent/60")}>
      <header className="space-y-0.5 px-2 pb-2 pt-1">
        <div className="flex items-center justify-between">
          <StatusBadge map={dealStage} value={stage} />
          <span className="text-sm font-semibold tabular-nums" aria-label={`${deals.length} opportunité${deals.length > 1 ? "s" : ""}`}>{deals.length}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {deals.length === 0 ? "—" : withAmount.length === 0 ? "Aucun montant" : `${euros(total)}${withAmount.length < deals.length ? ` · ${withAmount.length}/${deals.length} montants` : ""}`}
          {closed && " · 30 j"}
        </p>
      </header>
      <ul className="flex flex-1 flex-col gap-2">
        {deals.map((d) => <DraggableCard key={d.id} deal={d} onOpen={onOpen} onMove={onMove} />)}
        {deals.length === 0 && <li className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Déposez une carte ici</li>}
      </ul>
    </section>
  )
}

function DraggableCard({ deal, onOpen, onMove }: { deal: BoardDeal; onOpen: (leadId: string) => void; onMove: (d: BoardDeal, s: DealStage) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id, disabled: !deal.canMove })
  return (
    <li ref={setNodeRef} className={cn("group relative", isDragging && "opacity-40")}>
      <CardBody deal={deal} onOpen={() => onOpen(deal.leadId)} />
      {deal.canMove && (
        <>
          <button {...listeners} {...attributes} aria-label={`Glisser la carte ${deal.name}`} className="absolute right-1 top-1 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing">
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={`Déplacer ${deal.name} vers une autre étape`} className="absolute bottom-1 right-1 h-7 px-2 text-xs">
                <MoveRight className="h-3.5 w-3.5" aria-hidden="true" /> Déplacer
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Déplacer vers</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {STAGES.filter((s) => s !== deal.stage).map((s) => <DropdownMenuItem key={s} onSelect={() => onMove(deal, s)}>{dealStage[s].label}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </li>
  )
}

function CardBody({ deal, onOpen, overlay }: { deal: BoardDeal; onOpen?: () => void; overlay?: boolean }) {
  const late = deal.expectedCloseAt && new Date(deal.expectedCloseAt) < new Date() && deal.stage !== "WON" && deal.stage !== "LOST"
  return (
    <div className={cn("space-y-1.5 rounded-xl border bg-card p-3 pb-9 text-sm shadow-card", overlay && "rotate-2 shadow-pop")}>
      <button onClick={onOpen} className="block w-full pr-6 text-left font-semibold leading-snug hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {deal.name}
      </button>
      <p className="text-xs text-muted-foreground">{[deal.city, deal.contactName].filter(Boolean).join(" · ") || "—"}</p>
      <p className="font-semibold tabular-nums">{deal.amountCents != null ? euros(deal.amountCents) : <span className="font-normal text-muted-foreground">Montant non renseigné</span>}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{deal.ownerName ?? <span className="italic">À attribuer</span>}</span>
        {deal.nextMeetingAt && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" aria-hidden="true" /><span className="capitalize">{formatDateTime(deal.nextMeetingAt)}</span></span>}
        {deal.expectedCloseAt && <span className={cn(late && "font-semibold text-destructive-text")}>Signature {formatDate(deal.expectedCloseAt)}</span>}
      </div>
      {deal.stage === "LOST" && deal.lostReason && <p className="text-xs text-destructive-text">{deal.lostReason}</p>}
      <p className="text-[11px] text-muted-foreground">Mis à jour {ago(deal.updatedAt)}</p>
    </div>
  )
}
