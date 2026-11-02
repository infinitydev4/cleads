import { SUBJECT_MAX } from "@/features/outreach/footer"

/**
 * Pure helpers of the drafts (E22), shared by the worker, the send and the browser: how much a person changed a draft,
 * the subject of an answer, the booking line the CRM adds.
 */
const words = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim().split(" ").filter(Boolean)

/**
 * How much the sent message differs from the draft, from 0 (sent as written) to 1 (rewritten): the edit distance between
 * their words, over the longer one. Kept with the draft to measure the Rédacteur's quality (E27).
 */
export function editRatio(draft: string, sent: string): number {
  const a = words(draft)
  const b = words(sent)
  if (!a.length && !b.length) return 0
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    previous = current
  }
  return Math.round((previous[b.length] / Math.max(a.length, b.length)) * 1000) / 1000
}

/** « Re: » once, whatever the thread already piled up (« RE: Re: TR: … »). */
export function answerSubject(subject: string): string {
  const bare = subject.replace(/^\s*((re|tr|fw|fwd)\s*:\s*)+/i, "").trim()
  return `Re: ${bare || "votre message"}`.slice(0, SUBJECT_MAX)
}

/** The booking page closes an answer: written by the CRM, never by the model, so the link is always the right one. */
export const withBookingLine = (body: string, link: string | null) => (link ? `${body.trimEnd()}\n\nChoisissez le créneau qui vous convient : ${link}` : body.trimEnd())

/** Placeholders a model may leave for a person to fill (« [votre prénom] »): the draft says so. */
export const hasBracketPlaceholder = (text: string) => /\[[^\]\n]{2,40}\]/.test(text)
