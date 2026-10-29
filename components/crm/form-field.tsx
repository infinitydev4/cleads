"use client"

import { cloneElement, isValidElement, useId } from "react"
import { cn } from "@/lib/utils"

/**
 * Label above the control, optional hint, error announced to assistive technology.
 * Injects id / aria-invalid / aria-describedby into its single child.
 */
export function FormField({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: React.ReactElement<Record<string, unknown>>
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-destructive-text">*</span>}
      </label>
      {isValidElement(children) &&
        cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, required })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive-text">
          {error}
        </p>
      )}
    </div>
  )
}
