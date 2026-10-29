import { Badge } from "@/components/ui/badge"
import type { StatusMap } from "@/lib/crm/status"

/** `<StatusBadge map={leadStatus} value="QUALIFIED" />`. Unknown values stay readable instead of crashing. */
export function StatusBadge({ map, value }: { map: StatusMap; value: string }) {
  const meta = map[value]
  return <Badge variant={meta?.tone ?? "neutral"}>{meta?.label ?? value}</Badge>
}
