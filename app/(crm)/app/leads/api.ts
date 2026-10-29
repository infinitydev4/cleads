/** Calls the CRM API from the browser. Throws an Error carrying the server's message, ready to show in a toast. */
export async function api<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(body.error ?? "Une erreur est survenue"), { code: body.code as string | undefined, leadId: body.leadId as string | undefined })
  return body as T
}
