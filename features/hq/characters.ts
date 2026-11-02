/**
 * The 3D characters, made with Meshy from the team illustration of cleads.fr (docs/crm-v1/VUE-3D.md). Each file has a
 * skin and three clips: "sit" (at a desk), a talking clip ("sit_talk" seated or "stand_talk" standing) and "walk".
 * A member picks theirs; until then one is chosen from the role, always the same for the same person.
 */
export const CHARACTERS = {
  community: { label: "Blazer et lunettes", file: "/3d/characters/community.glb", talk: "stand_talk" },
  closer: { label: "Chemise et casque", file: "/3d/characters/closer.glb", talk: "sit_talk" },
  dev: { label: "Sweat à capuche", file: "/3d/characters/dev.glb", talk: "sit_talk" },
  manager: { label: "Costume et cravate", file: "/3d/characters/manager.glb", talk: "stand_talk" },
} as const

export type CharacterId = keyof typeof CHARACTERS
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[]
export const isCharacterId = (v: unknown): v is CharacterId => typeof v === "string" && v in CHARACTERS

const POOL_BY_ROLE: Record<string, CharacterId[]> = {
  OWNER: ["manager", "community"],
  MANAGER: ["community", "manager"],
  SDR: ["closer", "dev", "community"],
  CLOSER: ["closer", "manager", "community"],
  VIEWER: ["dev", "community"],
}

/** Small stable hash (FNV-1a) so a person keeps the same default character from one visit to the next. */
function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}

export function characterFor(member: { id: string; role: string; hqCharacter?: string | null }): CharacterId {
  if (isCharacterId(member.hqCharacter)) return member.hqCharacter
  const pool = POOL_BY_ROLE[member.role] ?? CHARACTER_IDS
  return pool[hash(member.id) % pool.length]
}
