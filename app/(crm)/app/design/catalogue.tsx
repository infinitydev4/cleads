"use client"

import { useState } from "react"
import { type ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Plus, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { FormField } from "@/components/crm/form-field"
import { StatCard } from "@/components/crm/stat-card"
import { StatusBadge } from "@/components/crm/status-badge"
import { EmptyState } from "@/components/crm/empty-state"
import { DataTable } from "@/components/crm/data-table"
import { dealStage, leadStatus, meetingStatus } from "@/lib/crm/status"

const swatches = [
  ["background", "Fond d’application"],
  ["card", "Cartes"],
  ["secondary", "Panneaux (panel)"],
  ["accent", "Survol / sélection"],
  ["primary", "Action (lime)"],
  ["sidebar", "Navy"],
  ["foreground", "Encre (texte)"],
  ["muted-foreground", "Texte secondaire"],
  ["success", "Succès"],
  ["warning", "Alerte"],
  ["info", "Information"],
  ["destructive", "Danger"],
] as const

interface Row {
  id: string
  company: string
  city: string
  status: keyof typeof leadStatus
  score: number
}
const rows: Row[] = [
  { id: "1", company: "Exemple Plomberie", city: "Lyon", status: "NEW", score: 82 },
  { id: "2", company: "Atelier Démo", city: "Nantes", status: "CONTACTED", score: 64 },
  { id: "3", company: "Cabinet Test", city: "Lille", status: "QUALIFIED", score: 91 },
  { id: "4", company: "Société Fictive", city: "Bordeaux", status: "DO_NOT_CONTACT", score: 12 },
]
const columns: ColumnDef<Row>[] = [
  { accessorKey: "company", header: "Entreprise", cell: (c) => <span className="font-semibold">{c.getValue<string>()}</span> },
  { accessorKey: "city", header: "Ville" },
  { accessorKey: "status", header: "Statut", cell: (c) => <StatusBadge map={leadStatus} value={c.getValue<string>()} /> },
  { accessorKey: "score", header: "Score", cell: (c) => <span className="tabular-nums">{c.getValue<number>()}</span> },
]

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-[-0.03em]">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export function DesignCatalogue() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("pas-un-email")

  function fakeSave() {
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      toast.success("Enregistré", { description: "Exemple de confirmation." })
    }, 1200)
  }

  return (
    <TooltipProvider>
      <div className="space-y-14">
        <Section title="Couleurs" description="Source : styles/tokens.json. Chaque paire texte/fond est testée (WCAG AA) en clair et en sombre.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {swatches.map(([token, label]) => (
              <div key={token} className="overflow-hidden rounded-xl border bg-card">
                <div className="h-14 border-b" style={{ background: `hsl(var(--${token}))` }} />
                <div className="p-2.5">
                  <p className="text-xs font-semibold">{label}</p>
                  <code className="text-[11px] text-muted-foreground">--{token}</code>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typographie" description="Inter. Titres 800 à interlettrage serré, texte courant 400 à 500, chiffres tabulaires.">
          <Card>
            <CardContent className="space-y-3 p-6">
              <p className="text-5xl font-extrabold tracking-[-0.055em]">Les bons prospects.</p>
              <p className="text-3xl font-extrabold tracking-[-0.04em]">Titre de page</p>
              <p className="text-xl font-bold tracking-tight">Titre de section</p>
              <p className="text-sm">Texte courant : relancer, qualifier, planifier. Lisible, sobre, sans effet.</p>
              <p className="text-sm text-muted-foreground">Texte secondaire pour les aides et les métadonnées.</p>
              <p className="text-2xl font-bold tabular-nums">1 234 567,89</p>
            </CardContent>
          </Card>
        </Section>

        <Section title="Boutons" description="Une seule action principale (lime) par écran. L’encre pour les actions fortes secondaires.">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Principal</Button>
            <Button variant="ink">Encre</Button>
            <Button variant="secondary">Secondaire</Button>
            <Button variant="outline">Contour</Button>
            <Button variant="ghost">Discret</Button>
            <Button variant="destructive">Supprimer</Button>
            <Button variant="link">Lien</Button>
            <Button size="sm">Petit</Button>
            <Button size="lg">Grand</Button>
            <Button variant="outline" size="icon" aria-label="Rechercher">
              <Search className="h-4 w-4" />
            </Button>
            <Button disabled>Désactivé</Button>
            <Button loading={loading} onClick={fakeSave}>
              <Plus className="h-4 w-4" /> {loading ? "Enregistrement…" : "Avec chargement"}
            </Button>
          </div>
        </Section>

        <Section title="Statuts et badges" description="Un statut = un libellé = une couleur, partout (lib/crm/status.ts).">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {Object.keys(leadStatus).map((k) => <StatusBadge key={k} map={leadStatus} value={k} />)}
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.keys(dealStage).map((k) => <StatusBadge key={k} map={dealStage} value={k} />)}
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.keys(meetingStatus).map((k) => <StatusBadge key={k} map={meetingStatus} value={k} />)}
              <Badge variant="default">Lime</Badge>
              <Badge variant="outline">Contour</Badge>
            </div>
          </div>
        </Section>

        <Section title="Formulaires" description="Libellé visible au-dessus du champ, aide, erreur annoncée aux lecteurs d’écran.">
          <Card>
            <CardContent className="grid gap-5 p-6 md:grid-cols-2">
              <FormField label="Entreprise" required hint="Nom tel qu’il apparaît sur le site.">
                <Input placeholder="Exemple Plomberie" />
              </FormField>
              <FormField label="Email" error={email.includes("@") ? undefined : "Saisissez une adresse valide."} required>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </FormField>
              <FormField label="Notes" className="md:col-span-2">
                <Textarea placeholder="Contexte de l’échange…" />
              </FormField>
              <label className="flex items-center gap-3 text-sm">
                <Checkbox /> Contact nominatif
              </label>
              <label className="flex items-center gap-3 text-sm">
                <Switch /> Relance automatique
              </label>
            </CardContent>
          </Card>
        </Section>

        <Section title="Indicateurs" description="Valeur absente = tiret. Aucun chiffre inventé.">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Prospects importés" value="1 248" delta={12} hint="vs semaine précédente" />
            <StatCard label="Taux de réponse" value="—" hint="Pas encore mesuré" />
            <StatCard label="Rendez-vous tenus" value={18} delta={-5} />
            <StatCard label="Chargement" loading />
          </div>
        </Section>

        <Section title="Tableau" description="Tri au clic sur l’en-tête, ligne atteignable au clavier (Tab, flèches, Entrée).">
          <DataTable columns={columns} data={rows} caption="Exemple de prospects" getRowId={(r) => r.id} onRowClick={(r) => toast(`Ouvrir ${r.company}`)} />
          <DataTable columns={columns} data={[]} loading caption="Exemple en chargement" />
        </Section>

        <Section title="Superpositions" description="Boîte de dialogue, panneau latéral (fiche sans quitter la liste), infobulle, notification.">
          <div className="flex flex-wrap gap-3">
            <Dialog>
              <DialogTrigger asChild><Button variant="outline">Dialogue</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Supprimer ce prospect ?</DialogTitle>
                  <DialogDescription>L’historique associé sera conservé 30 jours.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline">Annuler</Button>
                  <Button variant="destructive"><Trash2 className="h-4 w-4" /> Supprimer</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Sheet>
              <SheetTrigger asChild><Button variant="outline">Panneau latéral</Button></SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Exemple Plomberie</SheetTitle>
                  <SheetDescription>Fiche prospect en panneau.</SheetDescription>
                </SheetHeader>
              </SheetContent>
            </Sheet>
            <Tooltip>
              <TooltipTrigger asChild><Button variant="outline">Infobulle</Button></TooltipTrigger>
              <TooltipContent>Raccourci : N</TooltipContent>
            </Tooltip>
            <Button variant="outline" onClick={() => toast.success("Prospect importé")}>Succès</Button>
            <Button variant="outline" onClick={() => toast.error("Envoi impossible", { description: "Boîte d’envoi non connectée." })}>Erreur</Button>
          </div>
        </Section>

        <Section title="Onglets, cartes, états vides et chargement">
          <Tabs defaultValue="a">
            <TabsList>
              <TabsTrigger value="a">Activité</TabsTrigger>
              <TabsTrigger value="b">Emails</TabsTrigger>
              <TabsTrigger value="c">Notes</TabsTrigger>
            </TabsList>
            <TabsContent value="a">
              <Card>
                <CardHeader>
                  <CardTitle>Chronologie</CardTitle>
                  <CardDescription>Toutes les actions sur la fiche, dans l’ordre.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="b"><p className="p-4 text-sm text-muted-foreground">Emails de la fiche.</p></TabsContent>
            <TabsContent value="c"><p className="p-4 text-sm text-muted-foreground">Notes de la fiche.</p></TabsContent>
          </Tabs>
          <EmptyState art="rocket" title="Aucune séquence pour l’instant" description="Une séquence enchaîne 3 à 4 messages et s’arrête dès qu’un prospect répond." action={<Button>Créer une séquence</Button>} />
        </Section>
      </div>
    </TooltipProvider>
  )
}
