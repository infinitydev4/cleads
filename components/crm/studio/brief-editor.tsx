"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { FormField } from "@/components/crm/form-field"
import { CATALOG_FAMILIES } from "@/features/studio/fonts"
import { CTA_LABELS, SECTION_LABELS, type SiteView } from "@/features/studio/labels"
import { contrast, parseColor, readableOn, WHITE } from "@/features/studio/palette"
import { CTA_KINDS, IMAGE_USES, SECTION_KINDS, type Brief } from "@/features/studio/schemas"
import { api } from "@/app/(crm)/app/leads/api"

const USE_LABELS: Record<(typeof IMAGE_USES)[number], string> = { logo: "Logo", hero: "Premier écran", section: "Dans une section", gallery: "Réalisations" }

/** Points as lines: a line kept as it was keeps its sources, a line the person writes is theirs. */
function toLines(points: Brief["sections"][number]["points"]) {
  return points.map((p) => p.text).join("\n")
}
function fromLines(text: string, before: Brief["sections"][number]["points"]) {
  const sources = new Map(before.map((p) => [p.text, p.evidence]))
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 2)
    .slice(0, 8)
    .map((l) => ({ text: l.slice(0, 240), evidence: sources.get(l) ?? [] }))
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const rgb = parseColor(value)
  const text = rgb ? readableOn(rgb) : WHITE
  const ratio = rgb ? contrast(rgb, text) : null
  return (
    <FormField label={label} hint={ratio ? `Texte ${text === WHITE ? "blanc" : "sombre"} sur cette couleur : ${ratio.toFixed(1).replace(".", ",")}:1${ratio < 4.5 ? " (faible pour du texte courant)" : ""}` : undefined}>
      {(props) => (
        <div className="flex items-center gap-2">
          <input type="color" value={rgb ? value : "#2563eb"} onChange={(e) => onChange(e.target.value)} aria-label={`${label} : sélecteur`} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border bg-card p-1" />
          <Input {...props} value={value} onChange={(e) => onChange(e.target.value.trim().toLowerCase())} maxLength={7} className="font-mono" aria-invalid={!rgb || undefined} />
        </div>
      )}
    </FormField>
  )
}

/**
 * The brief, as the person reviews it before the page is generated (E23): the promise, the sections and their points,
 * the brand, the images, the main button and what to tell the Designer. Points that come from the site keep their
 * source; a point written here is the person's own.
 */
export function BriefEditor({ site, onChanged }: { site: SiteView; onChanged: () => void }) {
  const [brief, setBrief] = useState<Brief>(site.brief!)
  const [busy, setBusy] = useState<"save" | "build" | null>(null)
  const [lines, setLines] = useState(() => site.brief!.sections.map((s) => toLines(s.points)))
  const collected = site.collected
  // The same list the server accepts: the site's own families, then the Studio's.
  const fonts = useMemo(() => [...new Set([...(collected?.fonts ?? []), ...CATALOG_FAMILIES])], [collected])
  const images = collected?.images ?? []
  const ctas = CTA_KINDS.filter((k) => (k === "phone" ? collected?.contact.phone : k === "email" ? collected?.contact.email : collected?.contact.booking))
  const editable = site.can.edit && site.state !== "briefing" && site.state !== "building"

  const set = <K extends keyof Brief>(key: K, value: Brief[K]) => setBrief((b) => ({ ...b, [key]: value }))
  const setSection = (i: number, patch: Partial<Brief["sections"][number]>) => set("sections", brief.sections.map((s, n) => (n === i ? { ...s, ...patch } : s)))
  const move = (i: number, by: -1 | 1) => {
    const j = i + by
    if (j < 0 || j >= brief.sections.length) return
    const next = [...brief.sections]
    ;[next[i], next[j]] = [next[j], next[i]]
    const l = [...lines]
    ;[l[i], l[j]] = [l[j], l[i]]
    set("sections", next)
    setLines(l)
  }

  /** The brief with the sections' text turned back into points. */
  const current = (): Brief => ({ ...brief, toCheck: brief.toCheck.map((l) => l.trim()).filter((l) => l.length >= 2), sections: brief.sections.map((s, i) => ({ ...s, points: fromLines(lines[i] ?? "", s.points) })) })

  async function save(): Promise<boolean> {
    try {
      await api(`/api/studio/sites/${site.id}`, { method: "PATCH", body: JSON.stringify({ brief: current() }) })
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
      return false
    }
  }

  async function onSave() {
    setBusy("save")
    if (await save()) {
      toast.success("Brief enregistré")
      onChanged()
    }
    setBusy(null)
  }

  async function onBuild() {
    setBusy("build")
    try {
      if (!(await save())) return
      await api(`/api/studio/sites/${site.id}/build`, { method: "POST" })
      toast.success("Génération lancée : comptez 3 à 8 minutes.")
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec")
    } finally {
      setBusy(null)
    }
  }

  const evidenceLabel = (id: string) => (id.startsWith("P") ? "page du site" : id.startsWith("F") ? "fiche" : "audit")

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault()
        void onBuild()
      }}
    >
      <fieldset disabled={!editable} className="space-y-4">
        <legend className="mb-2 text-base font-bold">Promesse</legend>
        <FormField label="Titre du premier écran" required hint={`${brief.headline.length} caractères : 90 au plus se lisent d’un coup d’œil.`}>
          <Input value={brief.headline} onChange={(e) => set("headline", e.target.value)} maxLength={120} />
        </FormField>
        <FormField label="Sous-titre" hint="Le métier, la zone et la preuve la plus forte.">
          <Textarea value={brief.subheadline} onChange={(e) => set("subheadline", e.target.value)} maxLength={300} rows={2} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Positionnement" required>
            <Textarea value={brief.positioning} onChange={(e) => set("positioning", e.target.value)} maxLength={400} rows={3} />
          </FormField>
          <div className="space-y-4">
            <FormField label="Public">
              <Input value={brief.audience} onChange={(e) => set("audience", e.target.value)} maxLength={240} />
            </FormField>
            <FormField label="Ton">
              <Input value={brief.tone} onChange={(e) => set("tone", e.target.value)} maxLength={200} />
            </FormField>
          </div>
        </div>
      </fieldset>

      <fieldset disabled={!editable} className="space-y-3">
        <legend className="mb-2 text-base font-bold">Sections, dans l’ordre de la page</legend>
        <ol className="space-y-3">
          {brief.sections.map((s, i) => {
            const sourced = s.points.filter((p) => p.evidence.length).length
            return (
              <li key={i} className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-end gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold" aria-hidden="true">
                    {i + 1}
                  </span>
                  <FormField label="Type" className="w-44">
                    {(props) => (
                      <Select value={s.kind} onValueChange={(v) => setSection(i, { kind: v as (typeof SECTION_KINDS)[number] })}>
                        <SelectTrigger {...props}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SECTION_KINDS.map((k) => (
                            <SelectItem key={k} value={k}>
                              {SECTION_LABELS[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                  <FormField label="Titre" className="min-w-40 flex-1">
                    <Input value={s.title} onChange={(e) => setSection(i, { title: e.target.value })} maxLength={100} />
                  </FormField>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Monter la section ${i + 1}`}>
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === brief.sections.length - 1} aria-label={`Descendre la section ${i + 1}`}>
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        set("sections", brief.sections.filter((_, n) => n !== i))
                        setLines(lines.filter((_, n) => n !== i))
                      }}
                      disabled={brief.sections.length <= 3}
                      aria-label={`Retirer la section ${i + 1}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <FormField label="Points" hint={`Un point par ligne. ${sourced ? `${sourced} point${sourced > 1 ? "s" : ""} repris du site ou de la fiche (${[...new Set(s.points.flatMap((p) => p.evidence.map(evidenceLabel)))].join(", ")}).` : "Aucun point sourcé : ce que vous écrivez ici engage l’agence."}`}>
                  <Textarea value={lines[i] ?? ""} onChange={(e) => setLines(lines.map((l, n) => (n === i ? e.target.value : l)))} rows={Math.min(Math.max((lines[i] ?? "").split("\n").length, 2), 8)} />
                </FormField>
              </li>
            )
          })}
        </ol>
        {brief.sections.length < 9 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              set("sections", [...brief.sections, { kind: "about", title: "Nouvelle section", points: [] }])
              setLines([...lines, ""])
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Ajouter une section
          </Button>
        )}
      </fieldset>

      <fieldset disabled={!editable} className="space-y-4">
        <legend className="mb-2 text-base font-bold">Identité</legend>
        {collected && collected.colors.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Couleurs relevées :
            {collected.colors.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => set("palette", { ...brief.palette, primary: c.hex })}
                className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-1 font-mono transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title={`Prendre ${c.hex} comme couleur principale (${c.source === "logo" ? "logo" : c.source === "theme" ? "couleur déclarée du site" : "feuilles de style"})`}
              >
                <span className="h-3.5 w-3.5 rounded-full border" style={{ background: c.hex }} aria-hidden="true" /> {c.hex}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField label="Couleur principale" value={brief.palette.primary} onChange={(v) => set("palette", { ...brief.palette, primary: v })} />
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch checked={brief.palette.accent != null} onCheckedChange={(on) => set("palette", { ...brief.palette, accent: on ? (brief.palette.accent ?? "#f59e0b") : null })} /> Couleur d’accent
            </label>
            {brief.palette.accent != null && <ColorField label="Accent" value={brief.palette.accent} onChange={(v) => set("palette", { ...brief.palette, accent: v })} />}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["heading", "body"] as const).map((k) => (
            <FormField key={k} label={k === "heading" ? "Police des titres" : "Police du texte"} hint={collected?.fonts.includes(brief.fonts[k]) ? "Utilisée par le site actuel." : undefined}>
              {(props) => (
                <Select value={brief.fonts[k]} onValueChange={(v) => set("fonts", { ...brief.fonts, [k]: v })}>
                  <SelectTrigger {...props}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fonts.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                        {collected?.fonts.includes(f) ? " · site actuel" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={!editable} className="space-y-3">
        <legend className="mb-2 text-base font-bold">Images du site</legend>
        {images.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune image utilisable sur le site : la page utilisera des fonds neutres.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img) => {
              const chosen = brief.images.find((b) => b.name === img.name)
              return (
                <li key={img.name} className={cn("overflow-hidden rounded-xl border bg-card transition-opacity", !chosen && "opacity-70")}>
                  <div className={cn("grid h-32 place-items-center bg-muted", img.kind === "logo" && "bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px]")}>
                    <img src={`/api/studio/sites/${site.id}/assets/${img.name}`} alt={img.alt ?? ""} loading="lazy" className={cn("max-h-32 w-full", img.kind === "logo" ? "object-contain p-3" : "object-cover")} />
                  </div>
                  <div className="space-y-2 p-3">
                    <label className="flex items-center justify-between gap-2 text-sm font-medium">
                      <span>
                        {img.kind === "logo" ? "Logo" : img.name} <span className="font-normal text-muted-foreground">· {img.width}×{img.height}</span>
                      </span>
                      <Switch
                        checked={!!chosen}
                        aria-label={`Utiliser ${img.name}`}
                        onCheckedChange={(on) => set("images", on ? [...brief.images, { name: img.name, use: img.kind === "logo" ? "logo" : "section", alt: img.alt ?? "" }] : brief.images.filter((b) => b.name !== img.name))}
                      />
                    </label>
                    {chosen && (
                      <>
                        <Select value={chosen.use} onValueChange={(v) => set("images", brief.images.map((b) => (b.name === img.name ? { ...b, use: v as (typeof IMAGE_USES)[number] } : b)))}>
                          <SelectTrigger aria-label={`Place de ${img.name}`} className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {IMAGE_USES.map((u) => (
                              <SelectItem key={u} value={u}>
                                {USE_LABELS[u]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input value={chosen.alt} onChange={(e) => set("images", brief.images.map((b) => (b.name === img.name ? { ...b, alt: e.target.value } : b)))} maxLength={200} placeholder="Texte alternatif" aria-label={`Texte alternatif de ${img.name}`} className="h-8 text-xs" />
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </fieldset>

      <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-[14rem_1fr]">
        <legend className="mb-2 text-base font-bold">Bouton principal</legend>
        <FormField label="Action">
          {(props) => (
            <Select value={brief.cta.kind} onValueChange={(v) => set("cta", { ...brief.cta, kind: v as (typeof CTA_KINDS)[number] })}>
              <SelectTrigger {...props}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(ctas.length ? ctas : CTA_KINDS).map((k) => (
                  <SelectItem key={k} value={k}>
                    {CTA_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField label="Libellé" hint="Un verbe d’action : « Appeler l’atelier », « Demander un devis »…">
          <Input value={brief.cta.label} onChange={(e) => set("cta", { ...brief.cta, label: e.target.value })} maxLength={60} />
        </FormField>
      </fieldset>

      <fieldset disabled={!editable} className="space-y-4">
        <legend className="mb-2 text-base font-bold">Pour le Designer</legend>
        <FormField label="Ce qui change par rapport au site actuel" hint="Un point par ligne ; ils servent aussi au rendez-vous.">
          <Textarea
            value={brief.changes.map((c) => c.text).join("\n")}
            onChange={(e) => set("changes", fromLines(e.target.value, brief.changes).slice(0, 6))}
            rows={Math.min(Math.max(brief.changes.length, 2), 6)}
          />
        </FormField>
        <FormField label="À vérifier avec le prospect" hint="Pour l’équipe, jamais affiché sur la page : ce qui manque ou reste à confirmer. Un point par ligne.">
          <Textarea
            value={brief.toCheck.join("\n")}
            onChange={(e) =>
              set(
                "toCheck",
                e.target.value
                  .split("\n")
                  .map((l) => l.slice(0, 240))
                  .slice(0, 12)
              )
            }
            onBlur={() => set("toCheck", brief.toCheck.map((l) => l.trim()).filter((l) => l.length >= 2))}
            rows={Math.min(Math.max(brief.toCheck.length, 2), 6)}
            placeholder="Ex. : horaires d’ouverture, adresse email du cabinet."
          />
        </FormField>
        <FormField label="Consignes" hint="Ce que vous voulez voir, ou éviter, sur cette page (600 caractères).">
          <Textarea value={brief.notes} onChange={(e) => set("notes", e.target.value)} maxLength={600} rows={3} placeholder="Ex. : mettre en avant le dépannage d’urgence ; pas de photo de l’équipe." />
        </FormField>
      </fieldset>

      {editable && (
        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button type="submit" loading={busy === "build"} disabled={busy !== null}>
            {site.currentVersion ? <Wand2 className="h-4 w-4" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {site.currentVersion ? "Régénérer depuis le brief" : "Générer la maquette"}
          </Button>
          <Button type="button" variant="outline" onClick={onSave} loading={busy === "save"} disabled={busy !== null}>
            Enregistrer le brief
          </Button>
          <span className="text-xs text-muted-foreground">Environ 1 € (plafond 2 €), 3 à 8 minutes. La page est relue par une critique visuelle et corrigée au besoin.</span>
        </div>
      )}
    </form>
  )
}
