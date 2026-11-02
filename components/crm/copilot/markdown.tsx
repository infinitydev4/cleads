import { Fragment, type ReactNode } from "react"

/**
 * The copilot's text, with the little formatting it writes: paragraphs, bullet and numbered lists, bold, italics and
 * code. Built from React elements only: no HTML is ever injected, and no link is made from the model's words (a
 * prompt hidden in a prospect's email could otherwise plant one). Fiches become links from the tools' results instead.
 */
type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] }

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBER = /^\s*\d{1,3}[.)]\s+(.*)$/

export function blocksOf(text: string): Block[] {
  const blocks: Block[] = []
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/^#{1,6}\s+/, "")
    const bullet = BULLET.exec(line)
    const number = bullet ? null : NUMBER.exec(line)
    const last = blocks.at(-1)
    if (bullet || number) {
      const kind = bullet ? "ul" : "ol"
      const item = (bullet ?? number)![1]
      if (last?.kind === kind) last.items.push(item)
      else blocks.push({ kind, items: [item] })
    } else if (!line.trim()) {
      if (last && !(last.kind === "p" && !last.lines.length)) blocks.push({ kind: "p", lines: [] })
    } else if (last?.kind === "p") {
      last.lines.push(line)
    } else if ((last?.kind === "ul" || last?.kind === "ol") && /^\s{2,}\S/.test(raw)) {
      last.items[last.items.length - 1] += ` ${line.trim()}`
    } else {
      blocks.push({ kind: "p", lines: [line] })
    }
  }
  return blocks.filter((b) => (b.kind === "p" ? b.lines.length > 0 : b.items.length > 0))
}

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g

/** Bold, italics and code within a line; everything else stays text. */
export function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((chunk, i) => {
    if (i % 2 === 0) return chunk
    if (chunk.startsWith("**") || chunk.startsWith("__")) return <strong key={i}>{chunk.slice(2, -2)}</strong>
    if (chunk.startsWith("`")) return <code key={i} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{chunk.slice(1, -1)}</code>
    return <em key={i}>{chunk.slice(1, -1)}</em>
  })
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 break-words text-sm leading-relaxed">
      {blocksOf(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(line)}
              </Fragment>
            ))}
          </p>
        ) : b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">
            {b.items.map((item, j) => <li key={j}>{inline(item)}</li>)}
          </ul>
        ) : (
          <ol key={i} className="list-decimal space-y-1 pl-5 marker:text-muted-foreground">
            {b.items.map((item, j) => <li key={j}>{inline(item)}</li>)}
          </ol>
        )
      )}
    </div>
  )
}
