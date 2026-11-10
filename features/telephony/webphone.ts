import { prisma } from "@/lib/prisma"
import type { CurrentUser } from "@/lib/auth/guard"
import { zadarmaConfigured, zadarmaGet, ZadarmaError } from "@/lib/telephony/zadarma"

/** Why the phone in the browser cannot be used, in words for the closer. */
export const WEBPHONE_UNAVAILABLE = {
  not_configured: "La téléphonie Zadarma n’est pas encore branchée : l’appel passe par ton téléphone.",
  no_extension: "Aucun poste Zadarma ne t’est attribué : demande-le à ton manager (Réglages › Équipe).",
  refused: "Zadarma refuse d’ouvrir le téléphone web : vérifie que cleads.fr est autorisé dans l’intégration WebRTC.",
} as const
export type WebphoneUnavailable = keyof typeof WEBPHONE_UNAVAILABLE

export type WebphoneSession = { ready: true; key: string; sip: string } | { ready: false; reason: WebphoneUnavailable; message: string }

/**
 * Zadarma's WebRTC keys last 72 hours: one is reused for a day, per extension and per server instance. Zadarma can drop a
 * key sooner (a newer key, a change to the WebRTC integration): the browser then asks for a fresh one.
 */
const KEY_TTL_MS = 24 * 3600_000
const keys = new Map<string, { key: string; until: number }>()
let pbx: string | null = null

/**
 * The extension as Zadarma's WebRTC widget knows it: "479288-100", the PBX number then the extension. Équipe stores
 * "100", as the PBX statistics and webhooks spell it; a key asked for "100" alone is never recognised by the widget.
 */
async function fullExtension(extension: string): Promise<string> {
  if (!pbx) {
    const body = JSON.parse(await zadarmaGet("/v1/pbx/internal/")) as { pbx_id?: unknown }
    if (body.pbx_id == null || !/^\d+$/.test(String(body.pbx_id))) throw new ZadarmaError("refused", "Zadarma n’a pas donné le numéro du standard.")
    pbx = String(body.pbx_id)
  }
  return `${pbx}-${extension}`
}

/**
 * What the browser needs to register the member's extension (E32 lot 2): a WebRTC key valid for that extension only.
 * The key lets its holder call from the extension, so it is handed to the member who has it and to no one else.
 */
export async function webphoneSession(user: CurrentUser, now = Date.now(), { fresh = false } = {}): Promise<WebphoneSession> {
  const unavailable = (reason: WebphoneUnavailable): WebphoneSession => ({ ready: false, reason, message: WEBPHONE_UNAVAILABLE[reason] })
  if (!zadarmaConfigured()) return unavailable("not_configured")
  const me = await prisma.user.findFirst({ where: { id: user.id, workspaceId: user.workspaceId }, select: { zadarmaExtension: true } })
  if (!me?.zadarmaExtension) return unavailable("no_extension")

  try {
    const sip = await fullExtension(me.zadarmaExtension)
    const cached = fresh ? null : keys.get(sip)
    if (cached && cached.until > now) return { ready: true, key: cached.key, sip }
    const body = JSON.parse(await zadarmaGet("/v1/webrtc/get_key/", { sip })) as { key?: unknown }
    if (typeof body.key !== "string" || !body.key) return unavailable("refused")
    keys.set(sip, { key: body.key, until: now + KEY_TTL_MS })
    return { ready: true, key: body.key, sip }
  } catch (error) {
    if (error instanceof ZadarmaError && error.kind === "refused") return unavailable("refused")
    throw error
  }
}

export const forgetWebphoneKeys = () => {
  keys.clear()
  pbx = null
}
