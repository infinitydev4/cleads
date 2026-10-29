const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" })
const dateYear = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" })
const dateTime = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—"
  const d = new Date(iso)
  return (d.getFullYear() === new Date().getFullYear() ? date : dateYear).format(d)
}

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))

/** "il y a 3 j": short and honest about order of magnitude. */
export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "Jamais"
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 60) return "à l’instant"
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  if (s < 86400 * 30) return `il y a ${Math.floor(s / 86400)} j`
  return formatDate(iso)
}

export const euros = (cents: number | null | undefined) =>
  cents == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100)
