"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { CheckCircle2, CircleAlert, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { MailStatus } from "@/lib/mail/status"
import { api } from "../../leads/api"

type ProviderId = "ses" | "resend"

const nf = new Intl.NumberFormat("fr-FR")

export function EmailSettings({ initial, email }: { initial: MailStatus; email: string }) {
  const router = useRouter()
  const [status, setStatus] = useState(initial)
  const [provider, setProvider] = useState<ProviderId>(initial.settings.transactionalProvider)
  const [fallback, setFallback] = useState(initial.settings.fallbackEnabled)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState<ProviderId | null>(null)
  const dirty = provider !== status.settings.transactionalProvider || fallback !== status.settings.fallbackEnabled

  async function save() {
    setBusy(true)
    try {
      const next = await api<MailStatus>("/api/settings/email", { method: "PUT", body: JSON.stringify({ transactionalProvider: provider, fallbackEnabled: fallback }) })
      setStatus(next)
      toast.success("Fournisseur enregistré")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(false)
    }
  }

  async function test(id: ProviderId) {
    setTesting(id)
    try {
      await api("/api/settings/email/test", { method: "POST", body: JSON.stringify({ provider: id }) })
      toast.success(`Test envoyé à ${email}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du test")
    } finally {
      setTesting(null)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Expéditeur : <span className="font-medium text-foreground">{status.from}</span></p>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-bold">Fournisseur par défaut</legend>
        {status.providers.map((p) => {
          const selected = provider === p.id
          const a = p.account
          return (
            <Card key={p.id} className={cn("p-4", selected && "border-primary ring-1 ring-primary/40")}>
              <div className="flex flex-wrap items-start gap-3">
                <label className={cn("flex min-w-0 flex-1 items-start gap-3", p.configured ? "cursor-pointer" : "cursor-not-allowed opacity-70")}>
                  <input type="radio" name="provider" className="mt-1 h-4 w-4" checked={selected} disabled={!p.configured} onChange={() => setProvider(p.id)} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">
                      {p.label}
                      {p.configured ? <Badge variant="success">Configuré</Badge> : <Badge variant="outline">Non configuré</Badge>}
                      {status.settings.transactionalProvider === p.id && <Badge variant="info">Actif</Badge>}
                    </span>
                    {p.id === "ses" && p.configured && p.region && <span className="mt-1 block text-sm text-muted-foreground">Région {p.region}</span>}
                    {!p.configured && <span className="mt-1 block text-sm text-muted-foreground">{p.id === "ses" ? "Ajoutez SES_ACCESS_KEY_ID et SES_SECRET_ACCESS_KEY dans les variables d’environnement." : "Ajoutez RESEND_API_KEY dans les variables d’environnement."}</span>}
                    {a && (
                      <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="inline-flex items-center gap-1.5">{a.productionAccess ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> : <CircleAlert className="h-4 w-4 text-warning" aria-hidden="true" />}{a.productionAccess ? "Production accordée" : "Mode test (sandbox)"}</span>
                        <span>{nf.format(a.sent24h)} / {nf.format(a.max24h)} envoyés sur 24 h</span>
                        <span>{a.maxPerSecond} par seconde</span>
                        {!a.sendingEnabled && <span className="font-medium text-destructive-text">Envoi suspendu par AWS</span>}
                      </span>
                    )}
                    {p.error && <span role="alert" className="mt-2 block text-sm text-destructive-text">Lecture du compte impossible : {p.error}</span>}
                  </span>
                </label>
                <Button variant="outline" size="sm" disabled={!p.configured} loading={testing === p.id} onClick={() => test(p.id)}><Send className="h-4 w-4" aria-hidden="true" /> M’envoyer un test</Button>
              </div>
            </Card>
          )
        })}
      </fieldset>

      <Card className="flex items-start justify-between gap-4 p-4">
        <div>
          <p className="font-semibold">Secours automatique</p>
          <p className="text-sm text-muted-foreground">Si le fournisseur choisi échoue, l’email repart par l’autre (s’il est configuré). Une confirmation de rendez-vous ne se perd pas pour une panne.</p>
        </div>
        <Switch checked={fallback} onCheckedChange={setFallback} aria-label="Secours automatique" />
      </Card>

      <Card className="space-y-2 p-4">
        <p className="font-semibold">Rebonds et plaintes</p>
        {status.eventTracking.topicConfigured && status.eventTracking.configurationSet ? (
          <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> Suivi actif (jeu de configuration « {status.eventTracking.configurationSet} »). Une adresse en rebond définitif ou qui se plaint n’est plus jamais contactée.</p>
        ) : (
          <p className="flex items-start gap-2 text-sm"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" /> Pas encore branché : sans lui, AWS ne prévient pas le CRM des rebonds. Il faut un jeu de configuration SES, un sujet SNS et les variables <code>SES_CONFIGURATION_SET</code> et <code>SES_SNS_TOPIC_ARN</code>. À faire avant un envoi en volume.</p>
        )}
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" loading={busy} disabled={!dirty} onClick={save}>Enregistrer</Button>
      </div>
    </div>
  )
}
