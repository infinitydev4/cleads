import { cn } from "@/lib/utils"

/** Placeholder for content that is loading; announce the region with aria-busy on its parent. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />
}
