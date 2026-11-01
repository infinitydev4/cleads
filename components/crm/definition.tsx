"use client"

import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** A figure's label with its definition one hover or one Tab away (E10: no number without its definition). */
export function Definition({ label, definition, className }: { label: string; definition: string; className?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={cn("inline-flex items-center gap-1 rounded text-left underline decoration-dotted decoration-muted-foreground/60 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
            {label}
            <Info className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
            <span className="sr-only"> : {definition}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-pretty font-normal leading-relaxed">{definition}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
