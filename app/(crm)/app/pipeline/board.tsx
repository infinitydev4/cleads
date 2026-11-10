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
import { dealStage } from "@/lib/crm/status"
import { ago, euros, formatDate, formatDateTime } from "@/lib/crm/format"
import { cn } from "@/lib/utils"
import { STAGES } from "@/features/pipeline/rules"
import type { BoardDeal } from "@/features/pipeline/service"
import type { DealStage } from "@prisma/client"
import { api } from "../leads/api"
import { personName, type Assignee } from "../leads/filter-bar"
import type { LeadDetail } from "@/features/leads/types"
import { CloserSheet } from "../call-file"
import { initialsOf } from "../closer-fiche"
import { LostDialog } from "../leads/lost-dialog"
import { WonDialog } from "../leads/won-dialog"

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
  const [winning, setWinning] = useState<BoardDeal | null>(null)
  const [q, setQ] = useState(filters.q ?? "")
  const [detail, setDetail] = useState<{ id: string; lead?: LeadDetail; error?: string } | null>(null)
  useEffect(() => {
    if (!openLead) return
    let cancelled = false
    api<LeadDetail>(`/api/leads/${openLead}`).then((lead) => !cancelled && setDetail({ id: openLead, lead })).catch((e) => !cancelled && setDetail({ id: openLead, error: e.message }))
    return () => { cancelled = true }
  }, [openLead])
  const current = detail?.id === openLead ? detail : null
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
    // Winning needs the amount signed; the server refuses without it, the dialog asks first.
    if (stage === "WON" && !(deal.amountCents && deal.amountCents > 0) && !("amountCents" in extra)) return setWinning(deal)
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
    <div className="space-y-5">
      <Summary deals={deals} />
      <div className="flex flex-wrap items-center gap-2.5">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une entreprise…" aria-label="Rechercher une opportunité" className="h-12 max-w-sm rounded-2xl bg-card" />
        <Select value={filters.owner ?? ANY} onValueChange={(v) => setFilter({ owner: v === ANY ? undefined : v })}>
          <SelectTrigger className="h-12 w-56 rounded-2xl bg-card font-semibold" aria-label="Responsable"><SelectValue /></SelectTrigger>
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
          <div className="grid min-w-[1320px] grid-cols-6 gap-3.5">
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
      <WonDialog
        key={`won-${winning?.id ?? "none"}`}
        name={winning?.name ?? ""}
        open={!!winning}
        onCancel={() => setWinning(null)}
        onConfirm={(amountCents) => {
          const deal = winning!
          setWinning(null)
          void move(deal, "WON", { amountCents })
        }}
      />
      <CloserSheet openId={openLead} lead={current?.lead ?? null} error={current?.error ?? null} currentUserId={currentUserId} onChange={(lead) => setDetail({ id: lead.id, lead })} onClose={() => { setOpenLead(null); router.refresh() }} />
    </div>
  )
}

const STAGE_DOT: Record<DealStage, string> = { QUALIFIED: "bg-info", MEETING_SET: "bg-warning", PROPOSAL: "bg-violet-600", NEGOTIATION: "bg-cyan-700", WON: "bg-success", LOST: "bg-destructive" }

/** The team's pipeline at a glance, from the cards shown (maquette « Pipeline v2 »). */
function Summary({ deals }: { deals: BoardDeal[] }) {
  const open = deals.filter((d) => d.stage !== "WON" && d.stage !== "LOST")
  const won = deals.filter((d) => d.stage === "WON")
  const sum = (list: BoardDeal[]) => list.reduce((t, d) => t + (d.amountCents ?? 0), 0)
  const late = open.filter((d) => d.expectedCloseAt && new Date(d.expectedCloseAt) < new Date()).length
  const decided = won.length + deals.filter((d) => d.stage === "LOST").length
  const items: [string, string, string, boolean][] = [
    ["En cours", euros(sum(open)), `${open.length} opportunité${open.length > 1 ? "s" : ""}`, false],
    ["Gagné · 30 jours", euros(sum(won)), `${won.length} signature${won.length > 1 ? "s" : ""}`, true],
    ["Taux de signature", decided ? `${Math.round((won.length / decided) * 100)} %` : "—", "gagnées sur décidées, 30 j", false],
    ["Signatures en retard", String(late), late ? "date de signature passée" : "rien en retard", false],
  ]
  return (
    <dl aria-label="Mon pipeline" className="grid grid-cols-2 gap-3 rounded-3xl bg-sidebar p-5 text-sidebar-foreground shadow-card lg:grid-cols-4">
      {items.map(([label, value, hint, accent]) => (
        <div key={label} className="rounded-2xl bg-white/5 px-4 py-3.5">
          <dt className="text-xs font-semibold text-sidebar-foreground/70">{label}</dt>
          <dd className={cn("mt-1 text-[24px] font-extrabold tabular-nums tracking-[-0.02em]", accent ? "text-primary" : "text-white")}>{value}</dd>
          <dd className="text-xs text-sidebar-foreground/70">{hint}</dd>
        </div>
      ))}
    </dl>
  )
}

function Column({ stage, deals, onOpen, onMove, activeStage }: { stage: DealStage; deals: BoardDeal[]; onOpen: (leadId: string) => void; onMove: (d: BoardDeal, s: DealStage) => void; activeStage?: DealStage }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const withAmount = deals.filter((d) => d.amountCents != null)
  const total = withAmount.reduce((s, d) => s + (d.amountCents ?? 0), 0)
  const closed = stage === "WON" || stage === "LOST"
  return (
    <section ref={setNodeRef} aria-label={`Colonne ${dealStage[stage].label}`} className={cn("flex min-h-[440px] flex-col rounded-3xl border border-transparent bg-secondary/70 p-3 transition-colors", isOver && activeStage !== stage && "border-sidebar bg-accent")}>
      <header className="space-y-1 px-1.5 pb-3 pt-1">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full", STAGE_DOT[stage])} />
          <span className="truncate text-sm font-extrabold">{dealStage[stage].label}</span>
          <span className="ml-auto rounded-full bg-card px-2 text-xs font-bold tabular-nums text-foreground/80" aria-label={`${deals.length} opportunité${deals.length > 1 ? "s" : ""}`}>{deals.length}</span>
        </span>
        <span className="block pl-[18px] text-xs font-bold tabular-nums text-muted-foreground">{withAmount.length ? euros(total) : "—"}{closed && " · 30 jours"}</span>
      </header>
      <ul className="flex flex-1 flex-col gap-2.5">
        {deals.map((d) => <DraggableCard key={d.id} deal={d} onOpen={onOpen} onMove={onMove} />)}
        {deals.length === 0 && <li className="rounded-2xl border-2 border-dashed border-border p-5 text-center text-xs font-semibold text-muted-foreground">Dépose une carte ici</li>}
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
  const closed = deal.stage === "WON" || deal.stage === "LOST"
  const late = !!deal.expectedCloseAt && new Date(deal.expectedCloseAt) < new Date() && !closed
  const next = deal.stage === "LOST"
    ? { text: deal.lostReason ?? "Perdue", tone: "bg-destructive-subtle text-destructive-text" }
    : deal.stage === "WON"
      ? { text: "Signée", tone: "bg-success-subtle text-success" }
      : deal.nextMeetingAt
        ? { text: `RDV ${formatDateTime(deal.nextMeetingAt)}`, tone: "bg-info-subtle text-info" }
        : late
          ? { text: `Signature prévue le ${formatDate(deal.expectedCloseAt!)}`, tone: "bg-destructive-subtle text-destructive-text" }
          : deal.expectedCloseAt
            ? { text: `Signature ${formatDate(deal.expectedCloseAt)}`, tone: "bg-secondary text-secondary-foreground" }
            : { text: "Planifier la suite", tone: "bg-warning-subtle text-warning" }
  return (
    <div className={cn("space-y-3 rounded-2xl border bg-card p-3.5 pb-10 text-sm shadow-card", overlay && "rotate-2 shadow-pop")}>
      <button onClick={onOpen} className="flex w-full items-center gap-2.5 pr-6 text-left focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-extrabold text-secondary-foreground">{initialsOf(deal.name)}</span>
        <span className="min-w-0">
          <span className="block truncate font-bold leading-snug hover:underline">{deal.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{[deal.city, deal.contactName].filter(Boolean).join(" · ") || "—"}</span>
        </span>
      </button>
      <p className="text-lg font-extrabold tabular-nums tracking-[-0.02em]">{deal.amountCents != null ? euros(deal.amountCents) : <span className="text-sm font-semibold text-muted-foreground">Montant à préciser</span>}</p>
      <p className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-1 text-xs font-bold", next.tone)}>{deal.nextMeetingAt && !closed && <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />}<span className="truncate first-letter:uppercase">{next.text}</span></p>
      <p className="flex justify-between gap-2 text-[11px] text-muted-foreground"><span>{deal.ownerName ?? <span className="italic">À attribuer</span>}</span><span>{ago(deal.updatedAt)}</span></p>
    </div>
  )
}
