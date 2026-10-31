"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2, CircleAlert, Pause, Pencil, Play, PlugZap, Plus, Send, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/crm/empty-state"
import { FormField } from "@/components/crm/form-field"
import { ago } from "@/lib/crm/format"
import type { MailboxView, TestResult } from "@/features/outreach/mailboxes"
import { MAX_DAILY_CAP, WARMUP_DAYS } from "@/features/outreach/rules"
import { api } from "../../leads/api"
import { personName, type Assignee } from "../../leads/filter-bar"

/** Server settings of common providers; "Autre" leaves every field to fill. */
const PRESETS = {
  google: { label: "Google Workspace", smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecure: true, imapHost: "imap.gmail.com", imapPort: 993, hint: "Activez la validation en deux étapes puis créez un mot de passe d’application : le mot de passe du compte est refusé." },
  zoho: { label: "Zoho Mail (Europe)", smtpHost: "smtp.zoho.eu", smtpPort: 465, smtpSecure: true, imapHost: "imap.zoho.eu", imapPort: 993, hint: "Avec la validation en deux étapes, utilisez un mot de passe d’application. IMAP doit être activé dans les réglages Zoho." },
  namecheap: { label: "Namecheap Private Email", smtpHost: "mail.privateemail.com", smtpPort: 465, smtpSecure: true, imapHost: "mail.privateemail.com", imapPort: 993, hint: "Le mot de passe de la boîte (pas celui du compte Namecheap)." },
  ovh: { label: "OVHcloud (Email Pro, MX Plan)", smtpHost: "ssl0.ovh.net", smtpPort: 465, smtpSecure: true, imapHost: "ssl0.ovh.net", imapPort: 993, hint: "Le mot de passe de la boîte, défini dans l’espace client OVHcloud." },
  microsoft: { label: "Microsoft 365", smtpHost: "smtp.office365.com", smtpPort: 587, smtpSecure: false, imapHost: "outlook.office365.com", imapPort: 993, hint: "L’envoi SMTP authentifié doit être autorisé pour la boîte dans l’administration Microsoft 365." },
  other: { label: "Autre (SMTP + IMAP)", smtpHost: "", smtpPort: 465, smtpSecure: true, imapHost: "", imapPort: 993, hint: "Les réglages SMTP et IMAP donnés par votre hébergeur de messagerie." },
} as const
type PresetId = keyof typeof PRESETS

const UNASSIGNED = "__none__"

interface Draft {
  address: string
  displayName: string
  ownerId: string
  username: string
  password: string
  smtpHost: string
  smtpPort: string
  smtpSecure: boolean
  imapHost: string
  imapPort: string
  dailyCap: string
  alreadyWarm: boolean
  signature: string
}

const emptyDraft = (preset: PresetId): Draft => {
  const p = PRESETS[preset]
  return { address: "", displayName: "", ownerId: UNASSIGNED, username: "", password: "", smtpHost: p.smtpHost, smtpPort: String(p.smtpPort), smtpSecure: p.smtpSecure, imapHost: p.imapHost, imapPort: String(p.imapPort), dailyCap: "30", alreadyWarm: false, signature: "" }
}

const fromMailbox = (m: MailboxView): Draft => ({
  address: m.address, displayName: m.displayName, ownerId: m.ownerId ?? UNASSIGNED, username: m.username, password: "", smtpHost: m.smtpHost, smtpPort: String(m.smtpPort), smtpSecure: m.smtpSecure,
  imapHost: m.imapHost ?? "", imapPort: String(m.imapPort ?? 993), dailyCap: String(m.dailyCap), alreadyWarm: false, signature: m.signature ?? "",
})

function StatusBadge({ m }: { m: MailboxView }) {
  if (m.status === "ACTIVE") return <Badge variant="success">Active</Badge>
  if (m.status === "PAUSED") return <Badge variant="warning">En pause</Badge>
  return <Badge variant="destructive">En erreur</Badge>
}

export function MailboxesManager({ initial, senders, canSeal, protectedDomains }: { initial: MailboxView[]; senders: Assignee[]; canSeal: boolean; protectedDomains: string[] }) {
  const router = useRouter()
  const [boxes, setBoxes] = useState(initial)
  const [editing, setEditing] = useState<MailboxView | "new" | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const put = (m: MailboxView) => setBoxes((list) => (list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m].sort((a, b) => a.address.localeCompare(b.address))))
  const report = (test: TestResult | null, ok: string) => {
    if (!test) return toast.success(ok)
    if (test.ok) toast.success(`${ok}. Connexion vérifiée${test.imap ? `, copie des envois dans « ${test.sentFolder ?? "Envoyés"} »` : " (SMTP seul : pas de copie dans Envoyés)"}.`)
    else toast.error(`Connexion refusée : ${test.error}`)
  }

  async function run(id: string, task: () => Promise<void>) {
    setBusy(id)
    try {
      await task()
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  const test = (m: MailboxView) => run(`test:${m.id}`, async () => {
    const r = await api<{ mailbox: MailboxView; test: TestResult }>(`/api/mailboxes/${m.id}/test`, { method: "POST" })
    put(r.mailbox)
    report(r.test, "Test terminé")
  })
  const testEmail = (m: MailboxView) => run(`mail:${m.id}`, async () => {
    const r = await api<{ to: string }>(`/api/mailboxes/${m.id}/test-email`, { method: "POST" })
    toast.success(`Test envoyé à ${r.to} : vérifiez qu’il arrive en boîte de réception, pas en spam.`)
    put((await api<{ mailboxes: MailboxView[] }>("/api/mailboxes")).mailboxes.find((x) => x.id === m.id) ?? m)
  })
  const setStatus = (m: MailboxView, status: "ACTIVE" | "PAUSED") => run(`status:${m.id}`, async () => {
    const r = await api<{ mailbox: MailboxView; test: TestResult | null }>(`/api/mailboxes/${m.id}`, { method: "PATCH", body: JSON.stringify({ status }) })
    put(r.mailbox)
    report(r.test, status === "PAUSED" ? "Boîte en pause" : "Boîte réactivée")
  })
  const remove = (m: MailboxView) => run(`delete:${m.id}`, async () => {
    if (!window.confirm(`Supprimer la boîte ${m.address} ?`)) return
    await api(`/api/mailboxes/${m.id}`, { method: "DELETE" })
    setBoxes((list) => list.filter((x) => x.id !== m.id))
    toast.success("Boîte supprimée")
  })

  return (
    <div className="space-y-6">
      {!canSeal && (
        <Card role="alert" className="flex items-start gap-3 border-warning p-4 text-sm">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p>Le serveur n’a pas de clé de chiffrement : ajoutez <code>MAILBOX_SECRET_KEY</code> (générée par <code>openssl rand -base64 32</code>) dans les variables d’environnement avant d’enregistrer une boîte.</p>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Jamais depuis {protectedDomains.join(", ")} : ce domaine porte les emails de rendez-vous et l’adresse de l’entreprise. Chauffe : {WARMUP_DAYS / 7} semaines (5, 10, 20 puis 30 par jour), plafond de {MAX_DAILY_CAP} par jour au plus.
        </p>
        <Button onClick={() => setEditing("new")} disabled={!canSeal}><Plus className="h-4 w-4" aria-hidden="true" /> Ajouter une boîte</Button>
      </div>

      {boxes.length === 0 ? (
        <EmptyState art="rocket" title="Aucune boîte d’envoi" description="Ajoutez une boîte d’un domaine secondaire (par exemple prenom@trycleads.com), attribuée à la personne qui écrira depuis elle." />
      ) : (
        <ul className="space-y-3">
          {boxes.map((m) => {
            const warming = m.warmupDay < WARMUP_DAYS
            return (
              <li key={m.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 font-semibold">{m.displayName} <span className="font-normal text-muted-foreground">&lt;{m.address}&gt;</span> <StatusBadge m={m} /></div>
                      <p className="text-sm text-muted-foreground">
                        {m.ownerName ? `Attribuée à ${m.ownerName}` : "Attribuée à personne (seuls propriétaire et managers peuvent l’utiliser)"} · {m.smtpHost}:{m.smtpPort}{m.imapHost ? ` · IMAP ${m.imapHost}` : " · sans IMAP"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" loading={busy === `test:${m.id}`} onClick={() => test(m)}><PlugZap className="h-4 w-4" aria-hidden="true" /> Tester</Button>
                      <Button variant="outline" size="sm" disabled={m.status !== "ACTIVE"} loading={busy === `mail:${m.id}`} onClick={() => testEmail(m)}><Send className="h-4 w-4" aria-hidden="true" /> M’envoyer un test</Button>
                      <Button variant="outline" size="sm" onClick={() => setEditing(m)}><Pencil className="h-4 w-4" aria-hidden="true" /> Modifier</Button>
                      {m.status === "PAUSED" || m.status === "ERROR" ? (
                        <Button variant="outline" size="sm" loading={busy === `status:${m.id}`} onClick={() => setStatus(m, "ACTIVE")}><Play className="h-4 w-4" aria-hidden="true" /> Réactiver</Button>
                      ) : (
                        <Button variant="outline" size="sm" loading={busy === `status:${m.id}`} onClick={() => setStatus(m, "PAUSED")}><Pause className="h-4 w-4" aria-hidden="true" /> Pause</Button>
                      )}
                      <Button variant="ghost" size="sm" aria-label={`Supprimer ${m.address}`} loading={busy === `delete:${m.id}`} onClick={() => remove(m)}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <span><span className="font-semibold">{m.sentToday} / {m.allowanceToday}</span> aujourd’hui</span>
                    <span>{warming ? `Chauffe : jour ${m.warmupDay + 1} sur ${WARMUP_DAYS}` : "Chauffée"} · plafond {m.dailyCap} par jour</span>
                    <span className="text-muted-foreground">{m.lastTestedAt ? `Testée ${ago(m.lastTestedAt)}` : "Jamais testée"}</span>
                  </div>
                  {m.status !== "ACTIVE" && m.statusReason && (
                    <p role="status" className="flex items-start gap-2 text-sm text-destructive-text"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {m.statusReason}</p>
                  )}
                  {m.status === "ACTIVE" && m.lastTestedAt && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> Prête à envoyer</p>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <MailboxDialog
          mailbox={editing === "new" ? null : editing}
          senders={senders}
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={(m, t) => {
            put(m)
            report(t, editing === "new" ? "Boîte ajoutée" : "Boîte enregistrée")
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function MailboxDialog({ mailbox, senders, onOpenChange, onSaved }: { mailbox: MailboxView | null; senders: Assignee[]; onOpenChange: (open: boolean) => void; onSaved: (m: MailboxView, test: TestResult | null) => void }) {
  const [preset, setPreset] = useState<PresetId>(mailbox ? "other" : "google")
  const [d, setD] = useState<Draft>(mailbox ? fromMailbox(mailbox) : emptyDraft("google"))
  const [restartWarmup, setRestartWarmup] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((x) => ({ ...x, [key]: value }))
  const text = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as never)

  function choosePreset(id: PresetId) {
    setPreset(id)
    const p = PRESETS[id]
    setD((x) => ({ ...x, smtpHost: p.smtpHost, smtpPort: String(p.smtpPort), smtpSecure: p.smtpSecure, imapHost: p.imapHost, imapPort: String(p.imapPort) }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    const body = {
      displayName: d.displayName,
      ownerId: d.ownerId === UNASSIGNED ? null : d.ownerId,
      username: d.username || d.address,
      smtpHost: d.smtpHost,
      smtpPort: Number(d.smtpPort),
      smtpSecure: d.smtpSecure,
      imapHost: d.imapHost.trim() || null,
      imapPort: d.imapHost.trim() ? Number(d.imapPort) : null,
      imapSecure: true,
      dailyCap: Number(d.dailyCap),
      signature: d.signature,
      ...(d.password ? { password: d.password } : {}),
    }
    try {
      const r = mailbox
        ? await api<{ mailbox: MailboxView; test: TestResult | null }>(`/api/mailboxes/${mailbox.id}`, { method: "PATCH", body: JSON.stringify({ ...body, ...(restartWarmup ? { restartWarmup: true } : {}) }) })
        : await api<{ mailbox: MailboxView; test: TestResult }>("/api/mailboxes", { method: "POST", body: JSON.stringify({ ...body, address: d.address, alreadyWarm: d.alreadyWarm }) })
      onSaved(r.mailbox, r.test)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <form onSubmit={submit} className="min-w-0 space-y-5">
          <DialogHeader>
            <DialogTitle>{mailbox ? `Modifier ${mailbox.address}` : "Ajouter une boîte d’envoi"}</DialogTitle>
            <DialogDescription>La connexion est testée à l’enregistrement. Le mot de passe est chiffré sur le serveur et n’est plus jamais affiché.</DialogDescription>
          </DialogHeader>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-bold">La boîte</legend>
            {!mailbox && (
              <FormField label="Adresse" required hint="Sur un domaine secondaire, jamais le domaine principal.">
                <Input type="email" value={d.address} onChange={(e) => setD((x) => ({ ...x, address: e.target.value, username: x.username === x.address ? e.target.value : x.username }))} placeholder="prenom@trycleads.com" autoComplete="off" />
              </FormField>
            )}
            <FormField label="Nom affiché" required hint="Ce que le prospect voit comme expéditeur.">
              <Input value={d.displayName} onChange={text("displayName")} placeholder="Prénom Nom" />
            </FormField>
            <FormField label="Attribuée à" hint="Elle écrit depuis cette boîte. Propriétaire et managers peuvent les utiliser toutes.">
              {(field) => (
                <Select value={d.ownerId} onValueChange={(v) => set("ownerId", v)}>
                  <SelectTrigger {...field}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Personne</SelectItem>
                    {senders.map((s) => <SelectItem key={s.id} value={s.id}>{personName(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Plafond par jour" hint={`Une fois chauffée, ${MAX_DAILY_CAP} au plus. 30 est une bonne valeur.`}>
              <Input type="number" min={1} max={MAX_DAILY_CAP} value={d.dailyCap} onChange={text("dailyCap")} />
            </FormField>
            <FormField label="Signature" className="sm:col-span-2" hint="Ajoutée sous chaque message. Vide : le nom affiché.">
              <Textarea value={d.signature} onChange={text("signature")} rows={3} placeholder={"Prénom Nom\nCleads · 06 00 00 00 00"} />
            </FormField>
            {mailbox ? (
              <label className="flex items-start gap-2 text-sm sm:col-span-2"><Checkbox checked={restartWarmup} onCheckedChange={(v) => setRestartWarmup(v === true)} className="mt-0.5" /> Recommencer la chauffe (après une longue pause ou des rebonds)</label>
            ) : (
              <label className="flex items-start gap-2 text-sm sm:col-span-2"><Checkbox checked={d.alreadyWarm} onCheckedChange={(v) => set("alreadyWarm", v === true)} className="mt-0.5" /> Cette boîte envoie déjà normalement depuis plusieurs semaines : pas de chauffe</label>
            )}
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-bold">Connexion</legend>
            <FormField label="Fournisseur" className="sm:col-span-2" hint={PRESETS[preset].hint}>
              {(field) => (
                <Select value={preset} onValueChange={(v) => choosePreset(v as PresetId)}>
                  <SelectTrigger {...field}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PRESETS).map(([id, p]) => <SelectItem key={id} value={id}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Identifiant" hint="Souvent l’adresse elle-même.">
              <Input value={d.username} onChange={text("username")} placeholder={d.address || "prenom@trycleads.com"} autoComplete="off" />
            </FormField>
            <FormField label="Mot de passe" required={!mailbox} hint={mailbox ? "Vide : le mot de passe enregistré est gardé." : undefined}>
              <Input type="password" value={d.password} onChange={text("password")} autoComplete="new-password" />
            </FormField>
            <FormField label="Serveur SMTP" required>
              <Input value={d.smtpHost} onChange={text("smtpHost")} placeholder="smtp.exemple.com" />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Port">
                <Input type="number" value={d.smtpPort} onChange={(e) => setD((x) => ({ ...x, smtpPort: e.target.value, smtpSecure: e.target.value === "465" ? true : e.target.value === "587" ? false : x.smtpSecure }))} />
              </FormField>
              <FormField label="Chiffrement">
                {(field) => (
                  <Select value={d.smtpSecure ? "tls" : "starttls"} onValueChange={(v) => set("smtpSecure", v === "tls")}>
                    <SelectTrigger {...field}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tls">SSL/TLS</SelectItem>
                      <SelectItem value="starttls">STARTTLS</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </div>
            <FormField label="Serveur IMAP" hint="Pour ranger une copie dans « Envoyés » (et lire les réponses ensuite). Facultatif.">
              <Input value={d.imapHost} onChange={text("imapHost")} placeholder="imap.exemple.com" />
            </FormField>
            <FormField label="Port IMAP">
              <Input type="number" value={d.imapPort} onChange={text("imapPort")} disabled={!d.imapHost.trim()} />
            </FormField>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" loading={busy}>{mailbox ? "Enregistrer" : "Ajouter et tester"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
