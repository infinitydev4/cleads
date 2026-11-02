/* eslint-disable no-console */
/** One JSON line per event on stdout (Docker keeps them, `docker compose logs` reads them). Never log secrets. */
export type Level = "info" | "warn" | "error"

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields })
  if (level === "error") console.error(line)
  else console.log(line)
}

export const errorFields = (error: unknown) =>
  error instanceof Error ? { error: error.message, name: error.name, code: (error as { code?: unknown }).code, stack: error.stack?.split("\n").slice(0, 6).join("\n") } : { error: String(error) }
