/**
 * robots.txt (RFC 9309): the audit only reads what the site lets robots read, and reports which AI robots it lets in
 * (the GEO part of the audit). The most specific group for our name wins over "*"; inside a group the longest
 * matching rule wins, and Allow wins a tie.
 */
export interface RobotsRule {
  allow: boolean
  path: string
}

export interface Robots {
  groups: { agents: string[]; rules: RobotsRule[] }[]
  sitemaps: string[]
}

export const AI_BOTS = ["GPTBot", "OAI-SearchBot", "Google-Extended", "ClaudeBot", "PerplexityBot", "CCBot"] as const

export const EMPTY_ROBOTS: Robots = { groups: [], sitemaps: [] }

export function parseRobots(text: string): Robots {
  const groups: Robots["groups"] = []
  const sitemaps: string[] = []
  let current: Robots["groups"][number] | null = null
  let lastWasAgent = false
  for (const raw of text.split(/\r?\n/).slice(0, 2_000)) {
    const line = raw.replace(/#.*$/, "").trim()
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (key === "sitemap" && value) sitemaps.push(value)
    else if ((key === "allow" || key === "disallow") && current) {
      // "Disallow:" with nothing allows everything: it is no rule.
      if (value) current.rules.push({ allow: key === "allow", path: value })
    }
  }
  return { groups, sitemaps }
}

/** A robots.txt path pattern: "*" matches anything, a final "$" anchors the end. */
function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$")
  const body = anchored ? pattern.slice(0, -1) : pattern
  const re = new RegExp(`^${body.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${anchored ? "$" : ""}`)
  return re.test(path)
}

function groupFor(robots: Robots, agent: string) {
  const name = agent.toLowerCase()
  let best: Robots["groups"][number] | null = null
  let bestLength = -1
  for (const g of robots.groups) {
    for (const a of g.agents) {
      if (a !== "*" && name.includes(a) && a.length > bestLength) {
        best = g
        bestLength = a.length
      }
    }
  }
  if (best) return best
  const star = robots.groups.filter((g) => g.agents.includes("*"))
  return star.length ? { agents: ["*"], rules: star.flatMap((g) => g.rules) } : null
}

export function isAllowed(robots: Robots, agent: string, path: string): boolean {
  const group = groupFor(robots, agent)
  if (!group) return true
  let verdict: RobotsRule | null = null
  for (const rule of group.rules) {
    if (!matches(rule.path, path)) continue
    const length = rule.path.replace(/\$$/, "").length
    const best = verdict ? verdict.path.replace(/\$$/, "").length : -1
    if (length > best || (length === best && rule.allow)) verdict = rule
  }
  return verdict ? verdict.allow : true
}

/** Whether each AI robot may read the home page. */
export const aiBotsAccess = (robots: Robots) => AI_BOTS.map((bot) => ({ bot, allowed: isAllowed(robots, bot, "/") }))
