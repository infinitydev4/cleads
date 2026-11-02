import * as THREE from "three"
import type { AgentId } from "@/features/ai/agents"
import type { AgentState } from "@/features/hq/agency"
import { PALETTE } from "./materials"

/**
 * Small images drawn on a canvas for the screens and signs of the scene. Several are drawn from live CRM figures
 * (charts, kanban, calendar), so the room shows the data rather than decoration.
 */

function canvas(w: number, h: number) {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  return { c, g: c.getContext("2d")! }
}

function texture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

function screenBase(w: number, h: number) {
  const { c, g } = canvas(w, h)
  g.fillStyle = PALETTE.screen
  g.fillRect(0, 0, w, h)
  // A thin top bar, like an app window.
  g.fillStyle = "#1c2a45"
  g.fillRect(0, 0, w, h * 0.09)
  for (let i = 0; i < 3; i++) {
    g.fillStyle = ["#ff6b6b", "#ffd166", PALETTE.lime][i]
    g.beginPath()
    g.arc(w * 0.03 + i * w * 0.03, h * 0.045, h * 0.018, 0, Math.PI * 2)
    g.fill()
  }
  return { c, g }
}

/** Bars from values (e.g. prospects per week), with a lime line on the last points. */
export function chartTexture(values: number[], accent = PALETTE.lime) {
  const W = 512
  const H = 320
  const { c, g } = screenBase(W, H)
  const top = Math.max(1, ...values)
  const n = Math.max(1, values.length)
  const left = 36
  const right = W - 24
  const base = H - 36
  const span = base - H * 0.18
  const bw = ((right - left) / n) * 0.62
  g.strokeStyle = "#24365a"
  g.lineWidth = 2
  for (let i = 0; i <= 3; i++) {
    const y = base - (span * i) / 3
    g.beginPath()
    g.moveTo(left, y)
    g.lineTo(right, y)
    g.stroke()
  }
  values.forEach((v, i) => {
    const x = left + ((right - left) / n) * (i + 0.19)
    const h = Math.max(v ? 6 : 2, (v / top) * span)
    g.fillStyle = i === values.length - 1 ? accent : "#5d79c4"
    roundRect(g, x, base - h, bw, h, 6)
    g.fill()
  })
  g.strokeStyle = accent
  g.lineWidth = 5
  g.beginPath()
  values.forEach((v, i) => {
    const x = left + ((right - left) / n) * (i + 0.5)
    const y = base - (v / top) * span * 0.85 - 10
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  })
  g.stroke()
  return texture(c)
}

/** A donut: share of `part` in `whole` (conversion). */
export function donutTexture(share: number | null) {
  const S = 256
  const { c, g } = canvas(S, S)
  g.fillStyle = PALETTE.screen
  g.fillRect(0, 0, S, S)
  g.lineWidth = 34
  g.strokeStyle = "#24365a"
  g.beginPath()
  g.arc(S / 2, S / 2, 80, 0, Math.PI * 2)
  g.stroke()
  g.strokeStyle = PALETTE.lime
  g.beginPath()
  g.arc(S / 2, S / 2, 80, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.max(0.02, share ?? 0)))
  g.stroke()
  return texture(c)
}

/** Kanban board: one column per open stage, one card per opportunity (capped), from the real counts. */
export function kanbanTexture(counts: number[]) {
  const W = 512
  const H = 320
  const { c, g } = screenBase(W, H)
  const cols = counts.length
  const pad = 16
  const cw = (W - pad * (cols + 1)) / cols
  counts.forEach((count, i) => {
    const x = pad + i * (cw + pad)
    g.fillStyle = "#18263f"
    roundRect(g, x, H * 0.14, cw, H * 0.8, 10)
    g.fill()
    g.fillStyle = i === cols - 1 ? PALETTE.lime : "#8fa6dc"
    g.fillRect(x + 10, H * 0.17, cw * 0.5, 8)
    const shown = Math.min(count, 6)
    for (let k = 0; k < shown; k++) {
      g.fillStyle = k === 0 && i === cols - 1 ? PALETTE.lime : "#e9ecf6"
      roundRect(g, x + 8, H * 0.24 + k * 36, cw - 16, 28, 6)
      g.fill()
    }
    if (count > shown) {
      g.fillStyle = "#8fa6dc"
      g.font = "bold 22px Inter, system-ui, sans-serif"
      g.fillText(`+${count - shown}`, x + 10, H * 0.24 + shown * 36 + 22)
    }
  })
  return texture(c)
}

/** Week planner: lit cells = meetings of the next seven days (capped), the first one ticked. */
export function calendarTexture(meetings: number) {
  const S = 320
  const { c, g } = canvas(S, S)
  g.fillStyle = "#ffffff"
  g.fillRect(0, 0, S, S)
  g.fillStyle = PALETTE.navy
  g.fillRect(0, 0, S, 64)
  g.fillStyle = PALETTE.lime
  g.fillRect(70, 18, 20, 30)
  g.fillRect(230, 18, 20, 30)
  const lit = Math.min(meetings, 20)
  for (let i = 0; i < 20; i++) {
    const x = 22 + (i % 5) * 57
    const y = 84 + Math.floor(i / 5) * 56
    g.fillStyle = i < lit ? (i === 0 ? PALETTE.lime : "#c9d5f5") : "#eef0fa"
    roundRect(g, x, y, 48, 44, 8)
    g.fill()
  }
  if (lit > 0) {
    g.strokeStyle = PALETTE.navy
    g.lineWidth = 6
    g.beginPath()
    g.moveTo(34, 107)
    g.lineTo(44, 117)
    g.lineTo(60, 96)
    g.stroke()
  }
  return texture(c)
}

/** Campaign wall: a play button and the size of the active campaigns. */
export function campaignTexture(sizes: number[]) {
  const W = 512
  const H = 320
  const { c, g } = screenBase(W, H)
  g.fillStyle = "#1c2a45"
  roundRect(g, 24, 50, 250, 240, 14)
  g.fill()
  g.fillStyle = PALETTE.lime
  g.beginPath()
  g.moveTo(120, 120)
  g.lineTo(120, 220)
  g.lineTo(200, 170)
  g.closePath()
  g.fill()
  const top = Math.max(1, ...sizes)
  sizes.slice(0, 4).forEach((v, i) => {
    const h = Math.max(8, (v / top) * 200)
    g.fillStyle = i === 0 ? PALETTE.lime : "#8fa6dc"
    roundRect(g, 310 + i * 48, 290 - h, 34, h, 6)
    g.fill()
  })
  return texture(c)
}

export type IconKind = "email" | "linkedin" | "phone" | "whatsapp"

/** Square channel tile (white, coloured symbol), dimmed when the channel is not in the CRM yet. */
export function iconTexture(kind: IconKind, dim: boolean) {
  const S = 128
  const { c, g } = canvas(S, S)
  g.fillStyle = "#ffffff"
  roundRect(g, 4, 4, S - 8, S - 8, 24)
  g.fill()
  const color = dim ? "#b9c0d4" : { email: "#9cc400", linkedin: "#0a66c2", phone: "#12a150", whatsapp: "#25d366" }[kind]
  g.fillStyle = color
  g.strokeStyle = color
  g.lineWidth = 9
  g.lineJoin = "round"
  g.lineCap = "round"
  if (kind === "email") {
    roundRect(g, 28, 38, 72, 52, 8)
    g.stroke()
    g.beginPath()
    g.moveTo(30, 42)
    g.lineTo(64, 68)
    g.lineTo(98, 42)
    g.stroke()
  } else if (kind === "linkedin") {
    roundRect(g, 26, 26, 76, 76, 14)
    g.fill()
    g.fillStyle = "#ffffff"
    g.font = "bold 50px Arial, sans-serif"
    g.fillText("in", 39, 84)
  } else if (kind === "phone") {
    g.beginPath()
    g.moveTo(42, 30)
    g.quadraticCurveTo(26, 40, 34, 60)
    g.quadraticCurveTo(52, 92, 80, 100)
    g.quadraticCurveTo(98, 104, 100, 86)
    g.stroke()
  } else {
    g.beginPath()
    g.arc(64, 62, 34, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.moveTo(40, 88)
    g.lineTo(32, 104)
    g.lineTo(50, 96)
    g.stroke()
  }
  return texture(c)
}

/** Score dial for the qualification desk: the share of fiches waiting that are hot (score ≥ 70). */
export function scoreTexture(value: number) {
  const S = 256
  const { c, g } = canvas(S, S)
  g.fillStyle = "#ffffff"
  g.beginPath()
  g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 26
  g.strokeStyle = "#e9ecf6"
  g.beginPath()
  g.arc(S / 2, S / 2, 84, Math.PI * 0.75, Math.PI * 2.25)
  g.stroke()
  g.strokeStyle = PALETTE.neonInk
  g.beginPath()
  g.arc(S / 2, S / 2, 84, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * Math.min(1, Math.max(0.03, value / 100))))
  g.stroke()
  g.fillStyle = PALETTE.navy
  g.font = "800 64px Inter, system-ui, sans-serif"
  g.textAlign = "center"
  g.fillText(String(Math.round(value)), S / 2, S / 2 + 22)
  return texture(c)
}

/** The Cleads logo from /public, on a transparent background (async: the SVG must load first). */
export async function logoTexture(src = "/logo-black.svg") {
  const img = new Image()
  img.decoding = "async"
  img.src = src
  await img.decode()
  const W = 2048
  const H = Math.round((W * img.height) / img.width) || 380
  const { c, g } = canvas(W, H)
  g.clearRect(0, 0, W, H)
  g.drawImage(img, 0, 0, W, H)
  const t = texture(c)
  t.anisotropy = 8
  return t
}

// ---------------------------------------------------------------------------------------------------------------
// The AI wing (E26)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Pictograms of the agents as 24 × 24 SVG paths, in the stroke style of the CRM's icons (the HUD shows the same ones
 * with lucide: Target, Filter, Search, Tag, Mail, MessageSquare, PanelsTopLeft, Sparkles).
 */
export const AGENT_GLYPHS: Record<AgentId, string[]> = {
  strategist: ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M6 12a6 6 0 1 0 12 0a6 6 0 1 0 -12 0", "M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"],
  qualifier: ["M3 4h18l-7 8.5V19l-4 2v-8.5L3 4z"],
  auditor: ["M4 11a7 7 0 1 0 14 0a7 7 0 1 0 -14 0", "M21 21l-4.3-4.3"],
  offers: ["M3 3h8l10 10-8 8L3 11V3z", "M7.5 7.5h.01"],
  writer: ["M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M22 7l-10 6L2 7"],
  replies: ["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"],
  designer: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M3 9h18", "M9 21V9"],
  copilot: ["M12 3l1.9 5.8L19.5 11l-5.6 2.2L12 19l-1.9-5.8L4.5 11l5.6-2.2z", "M20 3v4", "M22 5h-4"],
}

const AMBER = "#f0b44a"

function glyph(g: CanvasRenderingContext2D, id: AgentId, x: number, y: number, size: number, color: string, width = 2) {
  g.save()
  g.translate(x, y)
  g.scale(size / 24, size / 24)
  g.strokeStyle = color
  g.lineWidth = width
  g.lineCap = "round"
  g.lineJoin = "round"
  for (const d of AGENT_GLYPHS[id]) g.stroke(new Path2D(d))
  g.restore()
}

/**
 * The holographic panel of a post: the agent's pictogram and three bars that say what it does (full and lime at work,
 * amber when it waits for a person, short when it rests). No text, so it reads from both sides.
 */
export function agentPanelTexture(id: AgentId, state: AgentState) {
  const W = 256
  const H = 160
  const { c, g } = canvas(W, H)
  const tone = state === "waiting" ? AMBER : state === "off" ? "#5b6782" : PALETTE.neon
  g.clearRect(0, 0, W, H)
  g.fillStyle = "rgba(11, 21, 35, 0.78)"
  roundRect(g, 3, 3, W - 6, H - 6, 18)
  g.fill()
  g.globalAlpha = state === "idle" || state === "off" ? 0.45 : 0.9
  g.strokeStyle = tone
  g.lineWidth = 3
  roundRect(g, 3, 3, W - 6, H - 6, 18)
  g.stroke()
  g.globalAlpha = 1
  glyph(g, id, 26, 42, 76, tone, 2.2)
  const fill = { working: [1, 0.72, 0.9], queued: [0.35, 0.2, 0.28], waiting: [1, 1, 1], idle: [0.25, 0.15, 0.2], off: [0, 0, 0] }[state]
  fill.forEach((f, i) => {
    const y = 46 + i * 28
    g.fillStyle = "rgba(255, 255, 255, 0.12)"
    roundRect(g, 128, y, 100, 12, 6)
    g.fill()
    if (f > 0) {
      g.fillStyle = tone
      roundRect(g, 128, y, Math.max(12, 100 * f), 12, 6)
      g.fill()
    }
  })
  return texture(c)
}

/** A landing page drawn in neon lines (the holographic canvas of the Studio): bar, promise, call to action, cards. */
export function pageWireTexture() {
  const W = 384
  const H = 480
  const { c, g } = canvas(W, H)
  g.clearRect(0, 0, W, H)
  g.fillStyle = "rgba(11, 21, 35, 0.55)"
  roundRect(g, 4, 4, W - 8, H - 8, 22)
  g.fill()
  g.strokeStyle = PALETTE.neon
  g.fillStyle = PALETTE.neon
  g.lineWidth = 4
  roundRect(g, 4, 4, W - 8, H - 8, 22)
  g.stroke()
  // Navigation bar and logo.
  g.beginPath()
  g.arc(36, 40, 12, 0, Math.PI * 2)
  g.fill()
  for (let i = 0; i < 3; i++) {
    roundRect(g, 214 + i * 50, 34, 36, 10, 5)
    g.fill()
  }
  // The promise, its subtitle and the call to action.
  roundRect(g, 32, 92, 250, 26, 10)
  g.fill()
  roundRect(g, 32, 128, 190, 26, 10)
  g.fill()
  g.globalAlpha = 0.55
  roundRect(g, 32, 170, 280, 10, 5)
  g.fill()
  roundRect(g, 32, 188, 220, 10, 5)
  g.fill()
  g.globalAlpha = 1
  roundRect(g, 32, 214, 120, 34, 17)
  g.fill()
  // Picture, three cards, footer.
  roundRect(g, 32, 268, W - 64, 82, 14)
  g.stroke()
  for (let i = 0; i < 3; i++) {
    roundRect(g, 32 + i * 110, 366, 96, 62, 12)
    g.stroke()
  }
  g.globalAlpha = 0.55
  roundRect(g, 32, 446, W - 64, 8, 4)
  g.fill()
  g.globalAlpha = 1
  return texture(c)
}

/**
 * A mock-up in the gallery: its first screen (the version's real capture) with the company's name on a plate, or an
 * empty frame waiting for the next one.
 */
export function framedThumbTexture(image: HTMLImageElement | null, caption: string) {
  const W = 512
  const H = 344
  const PLATE = 44
  const { c, g } = canvas(W, H)
  g.fillStyle = PALETTE.navy
  g.fillRect(0, 0, W, H)
  if (image) {
    // Cover the picture area from the top of the page, like the Studio's cards.
    const area = H - PLATE
    const scale = Math.max(W / image.width, area / image.height)
    g.drawImage(image, Math.max(0, (image.width - W / scale) / 2), 0, W / scale, area / scale, 0, 0, W, area)
  } else {
    glyph(g, "designer", W / 2 - 40, (H - PLATE) / 2 - 40, 80, "#5b6782", 1.6)
  }
  g.fillStyle = PALETTE.navy
  g.fillRect(0, H - PLATE, W, PLATE)
  g.fillStyle = image ? PALETTE.neon : "#5b6782"
  g.fillRect(18, H - PLATE + 18, 8, 8)
  g.fillStyle = image ? "#ffffff" : "#9aa3bb"
  g.font = "600 22px Inter, system-ui, sans-serif"
  let text = caption
  while (text.length > 1 && g.measureText(text).width > W - 60) text = `${text.slice(0, -2)}…`
  g.fillText(text, 38, H - 14)
  return texture(c)
}

/** The sign of the wing's totem: the copilot's star and "AGENCE IA", on navy. */
export function totemTexture() {
  const W = 256
  const H = 768
  const { c, g } = canvas(W, H)
  g.fillStyle = PALETTE.navy
  g.fillRect(0, 0, W, H)
  glyph(g, "copilot", W / 2 - 56, 70, 112, PALETTE.neon, 1.8)
  g.fillStyle = "#ffffff"
  g.textAlign = "center"
  g.font = "800 58px Inter, system-ui, sans-serif"
  g.fillText("AGENCE", W / 2, 330)
  g.fillStyle = PALETTE.lime
  g.font = "800 132px Inter, system-ui, sans-serif"
  g.fillText("IA", W / 2, 470)
  g.fillStyle = PALETTE.neon
  g.fillRect(W / 2 - 60, 520, 120, 6)
  g.fillStyle = "#9aa3bb"
  g.font = "600 30px Inter, system-ui, sans-serif"
  g.fillText("Agents · Studio", W / 2, 590)
  return texture(c)
}
