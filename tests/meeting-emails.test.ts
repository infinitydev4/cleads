import { beforeAll, describe, expect, it } from "vitest"
import { buildIcs, renderMeetingMail, whenLabel } from "@/features/meetings/emails"

beforeAll(() => {
  process.env.MEETING_LINK_SECRET = "test-secret-for-meeting-links"
})

const meeting = { id: "m1", startsAt: new Date("2026-06-08T08:00:00Z"), endsAt: new Date("2026-06-08T08:30:00Z"), type: "DISCOVERY" as const, videoUrl: "https://meet.example.com/abc" }
const base = { to: "x@y.test", meeting, hostName: "Alice Closer", guestName: "Camille <script>", manageUrl: "https://cleads.fr/rdv/gerer/t" }

describe("calendar invitation", () => {
  it("is valid iCalendar with UTC times, a stable uid and CRLF line ends", () => {
    const ics = buildIcs({ id: "m1", startsAt: meeting.startsAt, endsAt: meeting.endsAt, title: "Rendez-vous, avec; Alice", description: "ligne 1\nligne 2", location: meeting.videoUrl })
    expect(ics).toContain("BEGIN:VCALENDAR\r\n")
    expect(ics).toContain("DTSTART:20260608T080000Z\r\n")
    expect(ics).toContain("DTEND:20260608T083000Z\r\n")
    expect(ics).toContain("UID:m1@cleads.fr\r\n")
    expect(ics).toContain("SUMMARY:Rendez-vous\\, avec\; Alice\r\n")
    expect(ics).toContain("DESCRIPTION:ligne 1\\nligne 2")
    expect(ics).toContain("METHOD:REQUEST")
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true)
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true)
  })
  it("folds long lines and cancels with the same uid", () => {
    const ics = buildIcs({ id: "m1", startsAt: meeting.startsAt, endsAt: meeting.endsAt, title: "x".repeat(200), method: "CANCEL", sequence: 3 })
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true)
    expect(ics).toContain("METHOD:CANCEL")
    expect(ics).toContain("STATUS:CANCELLED")
    expect(ics).toContain("SEQUENCE:3")
  })
})

describe("meeting emails", () => {
  it("writes the time in the reader's timezone, in French", () => {
    expect(whenLabel(meeting.startsAt, "Europe/Paris")).toBe("lundi 8 juin à 10:00")
    expect(whenLabel(meeting.startsAt, "America/New_York")).toBe("lundi 8 juin à 04:00")
  })
  it("gives the guest a way to change, the host a way to open the fiche, and escapes names", () => {
    const guest = renderMeetingMail({ ...base, kind: "confirmation", audience: "guest" })
    expect(guest.subject).toBe("Rendez-vous confirmé : lundi 8 juin à 10:00")
    expect(guest.html).toContain("https://cleads.fr/rdv/gerer/t")
    expect(guest.html).toContain("https://meet.example.com/abc")
    expect(guest.ics).toContain("METHOD:REQUEST")
    const host = renderMeetingMail({ ...base, kind: "confirmation", audience: "host", leadUrl: "https://cleads.fr/app/leads/l1" })
    expect(host.html).toContain("https://cleads.fr/app/leads/l1")
    expect(host.html).not.toContain("<script>")
    expect(host.html).toContain("Camille &lt;script&gt;")
    expect(host.html).not.toContain("rdv/gerer")
  })
  it("cancellation carries a cancelling invitation and no link to change; a reminder has none at all", () => {
    const canceled = renderMeetingMail({ ...base, kind: "canceled", audience: "guest" })
    expect(canceled.ics).toContain("METHOD:CANCEL")
    expect(canceled.html).not.toContain("rdv/gerer")
    expect(canceled.html).not.toContain("meet.example.com")
    expect(renderMeetingMail({ ...base, kind: "reminder", audience: "guest" }).ics).toBeNull()
  })
})
