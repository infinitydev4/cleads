export const MAX_FAILED_LOGINS = 5
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000

/** Failures counted in the window; a sign-in lock lifts itself when the oldest ones leave it. */
export function isLockedOut(failureTimes: Date[], now = new Date()): boolean {
  const recent = failureTimes.filter((t) => now.getTime() - t.getTime() < LOCKOUT_WINDOW_MS)
  return recent.length >= MAX_FAILED_LOGINS
}

/** Minutes until a locked account can try again (0 when not locked). */
export function lockoutMinutesLeft(failureTimes: Date[], now = new Date()): number {
  const recent = failureTimes
    .filter((t) => now.getTime() - t.getTime() < LOCKOUT_WINDOW_MS)
    .sort((a, b) => b.getTime() - a.getTime())
  if (recent.length < MAX_FAILED_LOGINS) return 0
  const unlockAt = recent[MAX_FAILED_LOGINS - 1].getTime() + LOCKOUT_WINDOW_MS
  return Math.max(1, Math.ceil((unlockAt - now.getTime()) / 60000))
}
