const COMMON = ["password", "motdepasse", "azertyuiop", "qwertyuiop", "123456789012", "cleads", "bienvenue"]

/** Returns an error message, or null when the password is acceptable. Length beats complexity rules. */
export function validatePassword(password: string, context: { email?: string; name?: string } = {}): string | null {
  if (password.length < 12) return "Le mot de passe doit contenir au moins 12 caractères."
  if (password.length > 128) return "Le mot de passe ne doit pas dépasser 128 caractères."
  const lower = password.toLowerCase()
  const local = context.email?.split("@")[0]?.toLowerCase()
  if (local && local.length >= 4 && lower.includes(local)) return "Le mot de passe ne doit pas contenir votre adresse email."
  if (COMMON.some((word) => lower.includes(word))) return "Ce mot de passe est trop courant."
  if (/^(.)\1+$/.test(password) || /^\d+$/.test(password)) return "Ce mot de passe est trop simple."
  return null
}
