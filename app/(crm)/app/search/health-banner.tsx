import { AlertTriangle, CheckCircle2, PlugZap, WifiOff } from "lucide-react"
import type { HealthView } from "@/features/search/service"
import { cn } from "@/lib/utils"

/** "Is Google blocking us?" answered before you launch anything, in words. */
export function HealthBanner({ health }: { health: HealthView }) {
  const view =
    health.state === "ok" && health.blocked.length === 0
      ? { tone: "ok", icon: CheckCircle2, title: "Les sources répondent normalement", detail: health.lines[0] }
      : health.state === "not_configured"
        ? { tone: "bad", icon: PlugZap, title: "Cleads Extractor n’est pas relié", detail: "Renseignez EXTRACTOR_URL et EXTRACTOR_API_KEY dans l’environnement du CRM (voir le README)." }
        : health.state === "unreachable"
          ? { tone: "bad", icon: WifiOff, title: "Cleads Extractor ne répond pas", detail: health.lines[0] ?? "Réessayez dans un instant." }
          : { tone: "warn", icon: AlertTriangle, title: health.blocked.length ? `Source limitée ou bloquée : ${health.blocked.join(", ")}` : "Service dégradé", detail: "Une recherche lancée maintenant peut être lente ou incomplète. Réduisez le nombre de résultats ou réessayez plus tard." }

  const Icon = view.icon
  return (
    <div role="status" className={cn("flex items-start gap-3 rounded-xl border p-4 text-sm", view.tone === "ok" && "bg-success-subtle text-success", view.tone === "warn" && "bg-warning-subtle text-warning", view.tone === "bad" && "bg-destructive-subtle text-destructive-text")}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{view.title}</p>
        {view.detail && <p className="opacity-90">{view.detail}</p>}
      </div>
    </div>
  )
}
