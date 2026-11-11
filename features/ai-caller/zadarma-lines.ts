import { canonicalNumber, zadarmaConfigured, zadarmaGet } from "@/lib/telephony/zadarma"

/** The workspace's Zadarma numbers and PBX extensions, for importing one into ElevenLabs (E33). */
export interface ZadarmaLines {
  numbers: { number: string; label: string }[]
  pbxId: string | null
  extensions: string[]
  error: string | null
}

export async function zadarmaLines(): Promise<ZadarmaLines> {
  if (!zadarmaConfigured()) return { numbers: [], pbxId: null, extensions: [], error: "La téléphonie Zadarma n’est pas configurée." }
  try {
    const [direct, internal] = await Promise.all([zadarmaGet("/v1/direct_numbers/"), zadarmaGet("/v1/pbx/internal/")])
    const d = JSON.parse(direct) as { info?: { number?: unknown; number_name?: unknown; description?: unknown; status?: unknown }[] }
    const p = JSON.parse(internal) as { pbx_id?: unknown; numbers?: unknown[] }
    const numbers = (d.info ?? [])
      .filter((n) => n.number != null && (n.status == null || n.status === "on"))
      .map((n) => ({ number: canonicalNumber(String(n.number)), label: [n.number_name, n.description].filter((x) => typeof x === "string" && x).join(" · ") }))
      .filter((n) => n.number.startsWith("+"))
    const pbxId = p.pbx_id != null && /^\d+$/.test(String(p.pbx_id)) ? String(p.pbx_id) : null
    const extensions = (p.numbers ?? []).map(String).filter((e) => /^\d{2,6}$/.test(e))
    return { numbers, pbxId, extensions, error: null }
  } catch {
    return { numbers: [], pbxId: null, extensions: [], error: "Zadarma n’a pas donné la liste des numéros." }
  }
}
