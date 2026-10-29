"use client"

import { Toaster as SonnerToaster } from "sonner"
import { CheckCircle2, XCircle, AlertCircle, Info } from "lucide-react"

/** Colours come from the design tokens, so toasts follow the active theme. */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      closeButton
      toastOptions={{
        duration: 5000,
        classNames: {
          toast:
            "!rounded-xl !border !border-border !bg-popover !text-popover-foreground !shadow-pop !p-4 font-sans",
          title: "!text-sm !font-semibold",
          description: "!text-sm !text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground",
          cancelButton: "!bg-secondary !text-secondary-foreground",
          closeButton: "!border-border !bg-popover !text-muted-foreground",
        },
      }}
      icons={{
        success: <CheckCircle2 className="h-5 w-5 text-success" />,
        error: <XCircle className="h-5 w-5 text-destructive-text" />,
        warning: <AlertCircle className="h-5 w-5 text-warning" />,
        info: <Info className="h-5 w-5 text-info" />,
      }}
    />
  )
}
