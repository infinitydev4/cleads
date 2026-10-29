import Image from "next/image"
import { cn } from "@/lib/utils"

/** Explains what the area is for and what to do next. `art` is one of /public/images/home/*.webp. */
export function EmptyState({
  title,
  description,
  action,
  art,
  className,
}: {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  art?: "target" | "rocket" | "agent" | "team"
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-14 text-center", className)}>
      {art && (
        <div className="relative mb-6 h-32 w-32">
          <Image src={`/images/home/${art}.webp`} alt="" fill sizes="128px" className="object-contain" />
        </div>
      )}
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {description && <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
