"use client"

import { cloneElement, isValidElement, useId } from "react"
import { cn } from "@/lib/utils"

export interface FieldProps {
  id: string
  "aria-invalid"?: true
  "aria-describedby"?: string
  required?: boolean
}

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
  /** One element (gets the ids), or a function when the control is a composite (Select trigger). */
  children: React.ReactElement<Record<string, unknown>> | ((props: FieldProps) => React.ReactNode)
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
      {typeof children === "function"
        ? children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, required })
        : isValidElement(children) &&
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
