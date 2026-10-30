import { sendMail } from "@/lib/mail"
import { appBaseUrl } from "@/features/team/invite-email"
import { TEAM_TZ } from "@/lib/crm/day"
import { MEETING_TYPE_LABELS } from "./rules"
import { signMeetingToken } from "./token"

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

export const manageLink = (meetingId: string) => `${appBaseUrl()}/rdv/gerer/${signMeetingToken(meetingId)}`
export const bookingLink = (slug: string) => `${appBaseUrl()}/rdv/${slug}`

/** "mardi 2 juin à 14:30" in the timezone given. */
export function whenLabel(startsAt: Date, tz = TEAM_TZ): string {
  const day = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(startsAt)
  const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(startsAt)
  return `${day} à ${time}`
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
const icsText = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
/** Lines longer than 75 octets are folded, as the format requires. */
const fold = (line: string) => (line.length <= 73 ? line : line.match(/.{1,73}/g)!.join("\r\n "))

/** A calendar invitation any mail client can add. `method` CANCEL removes the event from the guest's calendar. */
export function buildIcs(m: { id: string; startsAt: Date; endsAt: Date; title: string; description?: string; location?: string | null; organizerEmail?: string; sequence?: number; method?: "REQUEST" | "CANCEL" }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cleads//CRM//FR",
    "CALSCALE:GREGORIAN",
    `METHOD:${m.method ?? "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${m.id}@cleads.fr`,
    `DTSTAMP:${icsDate(new Date())}`,
    `SEQUENCE:${m.sequence ?? 0}`,
    `DTSTART:${icsDate(m.startsAt)}`,
    `DTEND:${icsDate(m.endsAt)}`,
    `SUMMARY:${icsText(m.title)}`,
    ...(m.description ? [`DESCRIPTION:${icsText(m.description)}`] : []),
    ...(m.location ? [`LOCATION:${icsText(m.location)}`] : []),
    ...(m.organizerEmail ? [`ORGANIZER:mailto:${m.organizerEmail}`] : []),
    `STATUS:${m.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.map(fold).join("\r\n") + "\r\n"
}

export type MeetingMail = "confirmation" | "reminder" | "canceled" | "rescheduled"

interface MailInput {
  kind: MeetingMail
  to: string
  /** Who the message speaks to. */
  audience: "guest" | "host"
  meeting: { id: string; startsAt: Date; endsAt: Date; type: keyof typeof MEETING_TYPE_LABELS; videoUrl: string | null }
  hostName: string
  guestName: string
  timezone?: string
  /** Guest-only: where they can change or cancel. */
  manageUrl?: string
  /** Host-only: where the fiche is. */
  leadUrl?: string
}

const SUBJECTS: Record<MeetingMail, (when: string) => string> = {
  confirmation: (w) => `Rendez-vous confirmé : ${w}`,
  reminder: (w) => `Rappel : rendez-vous ${w}`,
  canceled: (w) => `Rendez-vous annulé : ${w}`,
  rescheduled: (w) => `Rendez-vous déplacé : ${w}`,
}

const INTRO: Record<MeetingMail, Record<"guest" | "host", (i: MailInput) => string>> = {
  confirmation: {
    guest: (i) => `Votre rendez-vous avec ${i.hostName} est confirmé.`,
    host: (i) => `${i.guestName} a réservé un rendez-vous avec vous.`,
  },
  reminder: {
    guest: (i) => `Un rappel : vous avez rendez-vous avec ${i.hostName}.`,
    host: (i) => `Un rappel : rendez-vous avec ${i.guestName}.`,
  },
  canceled: {
    guest: (i) => `Votre rendez-vous avec ${i.hostName} est annulé.`,
    host: (i) => `Le rendez-vous avec ${i.guestName} est annulé.`,
  },
  rescheduled: {
    guest: (i) => `Votre rendez-vous avec ${i.hostName} a été déplacé. Voici le nouveau créneau.`,
    host: (i) => `Le rendez-vous avec ${i.guestName} a été déplacé.`,
  },
}

export function renderMeetingMail(i: MailInput): { subject: string; html: string; ics: string | null } {
  const tz = i.timezone ?? TEAM_TZ
  const when = whenLabel(i.meeting.startsAt, tz)
  const minutes = Math.round((i.meeting.endsAt.getTime() - i.meeting.startsAt.getTime()) / 60_000)
  const rows = [
    `<strong>${escapeHtml(when)}</strong> (${minutes} min, ${escapeHtml(tz.replace("_", " "))})`,
    `Type : ${escapeHtml(MEETING_TYPE_LABELS[i.meeting.type])}`,
    ...(i.meeting.videoUrl && i.kind !== "canceled" ? [`Visio : <a href="${escapeHtml(i.meeting.videoUrl)}">${escapeHtml(i.meeting.videoUrl)}</a>`] : []),
  ]
  const action =
    i.audience === "guest" && i.manageUrl && i.kind !== "canceled"
      ? `<p><a href="${escapeHtml(i.manageUrl)}">Modifier ou annuler ce rendez-vous</a></p>`
      : i.audience === "host" && i.leadUrl
        ? `<p><a href="${escapeHtml(i.leadUrl)}">Ouvrir la fiche</a></p>`
        : ""
  const html = `<p>Bonjour,</p><p>${escapeHtml(INTRO[i.kind][i.audience](i))}</p><p>${rows.join("<br>")}</p>${action}<p>L’équipe Cleads</p>`
  const ics = i.kind === "reminder" ? null : buildIcs({ id: i.meeting.id, startsAt: i.meeting.startsAt, endsAt: i.meeting.endsAt, title: `Rendez-vous Cleads – ${i.audience === "guest" ? i.hostName : i.guestName}`, description: i.meeting.videoUrl ?? undefined, location: i.meeting.videoUrl, method: i.kind === "canceled" ? "CANCEL" : "REQUEST", sequence: i.kind === "confirmation" ? 0 : Math.floor(Date.now() / 1000) })
  return { subject: SUBJECTS[i.kind](when), html, ics }
}

/**
 * Transactional email (not marketing): sent because someone booked or a meeting changed. Returns false when it could
 * not go out; callers never fail an action because of it.
 */
export async function sendMeetingMail(i: MailInput): Promise<boolean> {
  const { subject, html, ics } = renderMeetingMail(i)
  const outcome = await sendMail(
    {
      to: i.to,
      subject,
      html,
      attachments: ics ? [{ filename: "rendez-vous.ics", content: Buffer.from(ics), contentType: `text/calendar; method=${i.kind === "canceled" ? "CANCEL" : "REQUEST"}` }] : undefined,
    },
    { purpose: "transactional" }
  )
  return outcome.ok
}
