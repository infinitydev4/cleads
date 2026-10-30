"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Building2, CalendarDays, ClipboardCheck, Globe, Mail, MapPin, Pencil, Phone, PhoneCall, ShieldAlert, Trash2, UserRound, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/crm/form-field"
import { StatusBadge } from "@/components/crm/status-badge"
import { leadStatus, meetingStatus } from "@/lib/crm/status"
import { ago, formatDate, formatDateTime } from "@/lib/crm/format"
import { formatPhone } from "@/lib/crm/normalize"
import { cn } from "@/lib/utils"
import type { LeadDetail } from "@/features/leads/types"
import { api } from "./api"
import { personName, type Assignee } from "./filter-bar"
import { DealsEditor } from "./deals-editor"
import { QualifyDialog } from "./qualify-dialog"
import { QUALIFICATION_LABELS } from "@/features/pipeline/rules"
import { ScoreMeter } from "./score-meter"
import { CallDialog } from "./call-dialog"
import { TasksCard } from "./tasks-card"
import { CALL_OUTCOMES } from "@/features/activity/rules"

interface Props {
  lead: LeadDetail
  assignees: Assignee[]
  currentUserId: string
  /** Called with the new state after any change, so a parent list can refresh. */
  onChange: (lead: LeadDetail) => void
  onDeleted?: () => void
}

const NONE = "__none__"

export function LeadDetailView({ lead, assignees, currentUserId, onChange, onDeleted }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [qualifying, setQualifying] = useState(false)
  const [calling, setCalling] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const canQualifyNow = lead.can.write && lead.status !== "DO_NOT_CONTACT" && lead.status !== "QUALIFIED" && lead.status !== "DISQUALIFIED"

  // Shortcuts, unless a field has the focus: q qualifies, c logs a call, t plans a task.
  useEffect(() => {
    const busy = qualifying || calling || editing || confirmDelete
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable || el.getAttribute("role") === "combobox"
      if (typing || busy || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === "q" && canQualifyNow) { e.preventDefault(); setQualifying(true) }
      else if (e.key === "c" && lead.can.log) { e.preventDefault(); setCalling(true) }
      else if (e.key === "t" && lead.can.log && lead.status !== "DO_NOT_CONTACT") { e.preventDefault(); setAddingTask(true) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [canQualifyNow, qualifying, calling, editing, confirmDelete, lead.can.log, lead.status])

  /** Re-reads the fiche after a change made elsewhere (a task ticked, a call logged). */
  async function reload() {
    onChange(await api<LeadDetail>(`/api/leads/${lead.id}`))
    router.refresh()
  }

  async function patch(body: object, success?: string) {
    try {
      const next = await api<LeadDetail>(`/api/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify(body) })
      onChange(next)
      router.refresh()
      if (success) toast.success(success)
      return next
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    }
  }

  async function remove() {
    try {
      await api(`/api/leads/${lead.id}`, { method: "DELETE" })
      toast.success("Fiche supprimée")
      setConfirmDelete(false)
      onDeleted?.()
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    }
  }

  const c = lead.company
  const k = lead.contact
  const title = c?.name ?? k?.name ?? k?.email ?? "Sans nom"
  const mineOrPool = lead.can.write
  const ownerOptions = lead.can.assignOthers ? assignees : assignees.filter((a) => a.id === currentUserId)

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-extrabold tracking-[-0.04em]">{title}</h2>
            <p className="text-sm text-muted-foreground">{[c?.city, c?.sector].filter(Boolean).join(" · ") || "Aucune localisation"} · ajoutée {formatDate(lead.createdAt)}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {canQualifyNow && (
              <Button size="sm" onClick={() => setQualifying(true)} title="Raccourci : q">
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Qualifier
              </Button>
            )}
            {lead.can.log && (
              <Button variant="outline" size="sm" onClick={() => setCalling(true)} title="Raccourci : c">
                <PhoneCall className="h-4 w-4" aria-hidden="true" /> Appel
              </Button>
            )}
            {lead.can.write && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" aria-hidden="true" /> Modifier
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Statut
            <Select value={lead.status} disabled={!mineOrPool} onValueChange={(status) => patch({ status }, "Statut mis à jour")}>
              <SelectTrigger aria-label="Statut"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(leadStatus).map(([key, m]) => <SelectItem key={key} value={key}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Responsable
            <Select value={lead.ownerId ?? NONE} disabled={!mineOrPool && lead.ownerId !== null} onValueChange={(v) => patch({ ownerId: v === NONE ? null : v }, "Responsable mis à jour")}>
              <SelectTrigger aria-label="Responsable"><SelectValue /></SelectTrigger>
              <SelectContent>
                {lead.can.assignOthers && <SelectItem value={NONE}>Pool non attribué</SelectItem>}
                {ownerOptions.map((a) => <SelectItem key={a.id} value={a.id}>{a.id === currentUserId ? `${personName(a)} (moi)` : personName(a)}</SelectItem>)}
                {lead.ownerId && !ownerOptions.some((a) => a.id === lead.ownerId) && <SelectItem value={lead.ownerId}>{lead.ownerName}</SelectItem>}
              </SelectContent>
            </Select>
          </label>
        </div>

        <TagEditor tags={lead.tags} disabled={!mineOrPool} onChange={(tags) => patch({ tags })} />

        {k?.doNotContact && (
          <p role="status" className="flex items-start gap-2 rounded-lg bg-destructive-subtle p-3 text-sm font-medium text-destructive-text">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Ne pas contacter{k.doNotContactReason ? ` : ${k.doNotContactReason}` : ""}. Aucun envoi n’est possible vers ce contact.
          </p>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Building2 className="h-4 w-4" aria-hidden="true" /> Entreprise</h3>
          <dl className="space-y-2 text-sm">
            <Info icon={Globe} label="Site" value={c?.website} href={c?.website ?? undefined} />
            <Info icon={Phone} label="Téléphone" value={formatPhone(c?.phone)} href={c?.phone ? `tel:${c.phone}` : undefined} />
            <Info icon={Mail} label="Email" value={c?.email} href={c?.email ? `mailto:${c.email}` : undefined} />
            <Info icon={MapPin} label="Adresse" value={[c?.address, [c?.postalCode, c?.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")} />
            {c?.siret && <Info label="SIRET" value={c.siret} />}
            {c?.rating != null && <Info label="Avis" value={`${c.rating}/5 · ${c.reviewCount ?? 0} avis`} />}
          </dl>
        </Card>
        <Card className="space-y-3 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold"><UserRound className="h-4 w-4" aria-hidden="true" /> Contact</h3>
          {k ? (
            <dl className="space-y-2 text-sm">
              <Info label="Nom" value={[k.name, k.jobTitle].filter(Boolean).join(" · ")} />
              <Info icon={Mail} label="Email" value={k.email} href={k.email ? `mailto:${k.email}` : undefined} extra={k.email ? <Badge variant={k.emailKind === "NOMINATIVE" ? "success" : "neutral"}>{k.emailKind === "NOMINATIVE" ? "nominatif" : k.emailKind === "GENERIC" ? "générique" : "à vérifier"}</Badge> : undefined} />
              <Info icon={Phone} label="Téléphone" value={formatPhone(k.phone)} href={k.phone ? `tel:${k.phone}` : undefined} />
              <Info label="Origine" value={[k.collectedFrom, k.collectedAt ? formatDate(k.collectedAt) : null].filter(Boolean).join(", ")} />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun contact. Ajoutez un nom ou un email avec « Modifier ».</p>
          )}
        </Card>
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Score de pertinence</h3>
          <ScoreMeter score={lead.score} />
        </div>
        {lead.scoreReasons.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {lead.scoreReasons.map((r) => <li key={r.code} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{r.label} <span className="text-muted-foreground">+{r.points}</span></li>)}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{lead.score === 0 ? "Rien ne le justifie encore : complétez la fiche (email, téléphone, site)." : "Score enregistré sans détail ; il sera expliqué à la prochaine modification de la fiche."}</p>
        )}
        <p className="text-xs text-muted-foreground">Règles simples et visibles ; les poids seront ajustés avec les résultats réels.</p>
      </Card>

      <QualificationCard lead={lead} onEdit={() => setQualifying(true)} />

      {lead.deals.length > 0 && (
        <Card className="p-4">
          <DealsEditor lead={lead} assignees={assignees} onChange={(next) => { onChange(next); router.refresh() }} />
        </Card>
      )}

      {lead.meetings.length > 0 && (
        <Card className="space-y-2 p-4">
          <section aria-label="Rendez-vous" className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-bold"><CalendarDays className="h-4 w-4" aria-hidden="true" /> Rendez-vous</h3>
            {lead.meetings.map((m) => <div key={m.id} className="flex flex-wrap items-center gap-2 text-sm"><span className="capitalize">{formatDateTime(m.startsAt)}</span><StatusBadge map={meetingStatus} value={m.status} /><span className="text-muted-foreground">avec {m.hostName}</span></div>)}
          </section>
        </Card>
      )}

      <TasksCard lead={lead} assignees={assignees} currentUserId={currentUserId} adding={addingTask} onAddingChange={setAddingTask} onChange={(next) => { onChange(next); router.refresh() }} refresh={reload} />

      <Timeline lead={lead} onChange={onChange} />

      {lead.can.delete && (
        <div className="border-t pt-4">
          <Button variant="ghost" size="sm" className="text-destructive-text hover:bg-destructive-subtle" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Supprimer définitivement
          </Button>
        </div>
      )}

      {calling && <CallDialog open={calling} onOpenChange={setCalling} leadId={lead.id} leadName={title} onDone={(next) => { onChange(next); router.refresh() }} />}
      {qualifying && <QualifyDialog open={qualifying} onOpenChange={setQualifying} lead={lead} assignees={assignees} onDone={(next) => { onChange(next); router.refresh() }} />}
      {editing && <EditDialog open={editing} onOpenChange={setEditing} lead={lead} onSave={async (body) => { const ok = await patch(body, "Fiche mise à jour"); if (ok) setEditing(false); return !!ok }} />}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer cette fiche ?</DialogTitle>
            <DialogDescription>L’historique, les rendez-vous et les opportunités liés sont effacés. L’adresse reste dans la liste d’exclusion si elle y était : la personne ne pourra pas être recontactée.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Annuler</Button>
            <Button variant="destructive" onClick={remove}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Info({ icon: Icon, label, value, href, extra }: { icon?: React.ComponentType<{ className?: string }>; label: string; value?: string | null; href?: string; extra?: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2">
      <dt className="flex w-20 shrink-0 items-center gap-1.5 text-muted-foreground">{Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}{label}</dt>
      <dd className="min-w-0 flex-1 break-words">
        {href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="underline-offset-2 hover:underline">{value}</a> : value} {extra}
      </dd>
    </div>
  )
}

function TagEditor({ tags, disabled, onChange }: { tags: string[]; disabled: boolean; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("")
  const add = () => {
    const t = draft.trim()
    if (t) onChange([...tags, t])
    setDraft("")
  }
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Étiquettes">
      {tags.map((t) => (
        <Badge key={t} variant="outline" className="gap-1">
          {t}
          {!disabled && <button aria-label={`Retirer l’étiquette ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="rounded-full hover:text-destructive-text"><X className="h-3 w-3" aria-hidden="true" /></button>}
        </Badge>
      ))}
      {!disabled && (
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }} onBlur={add} placeholder="+ étiquette" aria-label="Ajouter une étiquette" className="h-8 w-32 text-xs" />
      )}
    </div>
  )
}

const FILTERS = [
  { id: "ALL", label: "Tout", kinds: "" },
  { id: "NOTE", label: "Notes", kinds: "NOTE" },
  { id: "CALL", label: "Appels", kinds: "CALL" },
  { id: "TASK", label: "Tâches", kinds: "TASK" },
  { id: "CHANGES", label: "Changements", kinds: "STATUS_CHANGE,SYSTEM" },
] as const

type Entry = LeadDetail["activities"][number]

function entryText(a: Entry) {
  if (a.kind === "CALL") {
    const head = ["Appel", a.outcome && (CALL_OUTCOMES as Record<string, string>)[a.outcome], a.durationMin != null ? `${a.durationMin} min` : null].filter(Boolean).join(" · ")
    return { head, body: a.body }
  }
  if (a.kind === "STATUS_CHANGE") return { head: "Statut modifié", body: null }
  return { head: null, body: a.body }
}

/** One chronology for the fiche: notes, calls, tasks, status and opportunity changes, newest first. */
function Timeline({ lead, onChange }: { lead: LeadDetail; onChange: (lead: LeadDetail) => void }) {
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("ALL")
  // Entries fetched beyond the first page or under a filter; the unfiltered first page comes with the fiche.
  const [extra, setExtra] = useState<{ items: Entry[]; hasMore: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const kinds = FILTERS.find((f) => f.id === filter)!.kinds
  const newest = lead.activities[0]?.id
  // Something new was written (here or from another dialog): the filtered pages are stale, start again from the top.
  const [seen, setSeen] = useState(newest)
  if (seen !== newest) {
    setSeen(newest)
    setExtra(null)
    setFilter("ALL")
  }
  const first: Entry[] = lead.activities
  const shown = filter === "ALL" ? [...first, ...(extra?.items ?? [])] : (extra?.items ?? [])
  const hasMore = filter === "ALL" ? (extra ? extra.hasMore : first.length >= 30) : (extra?.hasMore ?? false)

  async function load(reset: boolean) {
    setLoading(true)
    try {
      const last = reset ? undefined : shown.at(-1)?.occurredAt
      const qs = new URLSearchParams()
      if (kinds) qs.set("kind", kinds)
      if (last) qs.set("before", last)
      const page = await api<{ items: Entry[]; hasMore: boolean }>(`/api/leads/${lead.id}/timeline?${qs}`)
      setExtra(reset || !extra ? page : { items: [...extra.items, ...page.items], hasMore: page.hasMore })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setLoading(false)
    }
  }

  function choose(id: (typeof FILTERS)[number]["id"]) {
    setFilter(id)
    setExtra(null)
    if (id !== "ALL") {
      const k = FILTERS.find((f) => f.id === id)!.kinds
      setLoading(true)
      api<{ items: Entry[]; hasMore: boolean }>(`/api/leads/${lead.id}/timeline?kind=${k}`)
        .then(setExtra)
        .catch((e) => toast.error(e instanceof Error ? e.message : "Échec"))
        .finally(() => setLoading(false))
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      onChange(await api<LeadDetail>(`/api/leads/${lead.id}/activities`, { method: "POST", body: JSON.stringify({ kind: "NOTE", body }) }))
      setBody("")
      setExtra(null)
      if (filter !== "ALL") setFilter("ALL")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Historique" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">Historique</h3>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrer l’historique">
          {FILTERS.map((f) => <Button key={f.id} type="button" size="sm" variant={filter === f.id ? "secondary" : "ghost"} aria-pressed={filter === f.id} onClick={() => choose(f.id)}>{f.label}</Button>)}
        </div>
      </div>
      {lead.can.log && (
        <form onSubmit={submit} className="space-y-2 rounded-xl border bg-card p-3">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} aria-label="Nouvelle note" placeholder="Une note pour l’équipe…" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }} />
          <div className="flex justify-end"><Button type="submit" size="sm" loading={busy} disabled={!body.trim()}>Ajouter la note</Button></div>
        </form>
      )}
      {shown.length === 0 && !loading && <p className="text-sm text-muted-foreground">{filter === "ALL" ? "Aucune activité pour l’instant." : "Rien dans cette catégorie."}</p>}
      <ol className="space-y-3">
        {shown.map((a) => {
          const { head, body: text } = entryText(a)
          return (
            <li key={a.id} className="flex gap-3 text-sm">
              <span aria-hidden="true" className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.kind === "NOTE" ? "bg-info" : a.kind === "CALL" ? "bg-success" : a.kind === "TASK" ? "bg-primary" : a.kind === "STATUS_CHANGE" ? "bg-warning" : "bg-muted-foreground/50")} />
              <div className="min-w-0 flex-1">
                {head && <p className="font-medium">{head}</p>}
                {text && <p className="whitespace-pre-wrap break-words">{text}</p>}
                <p className="text-xs text-muted-foreground">{a.actorName ?? (a.actorKind === "SYSTEM" ? "Système" : "—")} · {ago(a.occurredAt)}</p>
              </div>
            </li>
          )
        })}
      </ol>
      {hasMore && <div className="flex justify-center"><Button type="button" variant="outline" size="sm" loading={loading} onClick={() => load(false)}>Voir plus</Button></div>}
    </section>
  )
}

function EditDialog({ open, onOpenChange, lead, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; lead: LeadDetail; onSave: (body: object) => Promise<boolean> }) {
  const c = lead.company
  const k = lead.contact
  const [v, setV] = useState({
    name: c?.name ?? "", website: c?.website ?? "", phone: c?.phone ?? "", email: c?.email ?? "", address: c?.address ?? "", postalCode: c?.postalCode ?? "", city: c?.city ?? "", sector: c?.sector ?? "", siret: c?.siret ?? "",
    contactName: k?.name ?? "", jobTitle: k?.jobTitle ?? "", contactEmail: k?.email ?? "", contactPhone: k?.phone ?? "",
  })
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [key]: e.target.value })

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    const company = { name: v.name, website: v.website, phone: v.phone, email: v.email, address: v.address, postalCode: v.postalCode, city: v.city, sector: v.sector, siret: v.siret }
    const contact = { name: v.contactName, jobTitle: v.jobTitle, email: v.contactEmail, phone: v.contactPhone }
    await onSave({ company, contact })
    setBusy(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Modifier la fiche</DialogTitle>
            <DialogDescription>Un champ vide reste vide. Un doublon avec une autre fiche est signalé avant d’enregistrer.</DialogDescription>
          </DialogHeader>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-bold">Entreprise</legend>
            <FormField label="Nom" required className="sm:col-span-2"><Input value={v.name} onChange={set("name")} /></FormField>
            <FormField label="Site web"><Input value={v.website} onChange={set("website")} placeholder="https://" /></FormField>
            <FormField label="Téléphone" hint="Étranger : commencer par +"><Input value={v.phone} onChange={set("phone")} /></FormField>
            <FormField label="Email"><Input value={v.email} onChange={set("email")} type="email" /></FormField>
            <FormField label="SIRET"><Input value={v.siret} onChange={set("siret")} inputMode="numeric" /></FormField>
            <FormField label="Adresse" className="sm:col-span-2"><Input value={v.address} onChange={set("address")} /></FormField>
            <FormField label="Code postal"><Input value={v.postalCode} onChange={set("postalCode")} /></FormField>
            <FormField label="Ville"><Input value={v.city} onChange={set("city")} /></FormField>
            <FormField label="Secteur" className="sm:col-span-2"><Input value={v.sector} onChange={set("sector")} /></FormField>
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-bold">Contact</legend>
            <FormField label="Nom"><Input value={v.contactName} onChange={set("contactName")} /></FormField>
            <FormField label="Fonction"><Input value={v.jobTitle} onChange={set("jobTitle")} /></FormField>
            <FormField label="Email"><Input value={v.contactEmail} onChange={set("contactEmail")} type="email" /></FormField>
            <FormField label="Téléphone"><Input value={v.contactPhone} onChange={set("contactPhone")} /></FormField>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" loading={busy}>Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function QualificationCard({ lead, onEdit }: { lead: LeadDetail; onEdit: () => void }) {
  const q = lead.qualification
  const chips: string[] = []
  if (q?.budget) chips.push(QUALIFICATION_LABELS.budget[q.budget])
  if (q?.authority) chips.push(QUALIFICATION_LABELS.authority[q.authority])
  if (q?.timing) chips.push(QUALIFICATION_LABELS.timing[q.timing])
  const empty = !q || (chips.length === 0 && !q.need && !q.notes && !q.disqualification)
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold"><ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Qualification</h3>
        {lead.can.write && lead.status !== "DO_NOT_CONTACT" && <Button variant="ghost" size="sm" onClick={onEdit}>{empty ? "Renseigner" : "Modifier"}</Button>}
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground">Pas encore qualifié : besoin, budget, interlocuteur, échéance.</p>
      ) : (
        <div className="space-y-2 text-sm">
          {q?.need && <p className="whitespace-pre-wrap">{q.need}</p>}
          {chips.length > 0 && <ul className="flex flex-wrap gap-2">{chips.map((c) => <li key={c} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{c}</li>)}{q?.budgetAmountCents ? <li className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(q.budgetAmountCents / 100)}</li> : null}</ul>}
          {q?.notes && <p className="whitespace-pre-wrap text-muted-foreground">{q.notes}</p>}
          {q?.disqualification && <p className="rounded-lg bg-destructive-subtle p-2 font-medium text-destructive-text">Disqualifié : {q.disqualification.reason}{q.disqualification.detail ? ` (${q.disqualification.detail})` : ""}</p>}
        </div>
      )}
    </Card>
  )
}
