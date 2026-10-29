/** Client address as seen behind the hosting proxy (first hop of x-forwarded-for). */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || headers.get("x-real-ip") || null
}
