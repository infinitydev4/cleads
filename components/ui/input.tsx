"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false)
    const [hasValue, setHasValue] = React.useState(false)

    React.useEffect(() => {
      setHasValue(Boolean(props.value))
    }, [props.value])

    return (
      <div className="relative">
        {label && (
          <motion.label
            initial={false}
            animate={{
              y: isFocused || hasValue ? -24 : 0,
              scale: isFocused || hasValue ? 0.85 : 1,
              color: isFocused ? "#BFFF00" : "#9CA3AF",
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none origin-left transition-colors"
          >
            {label}
          </motion.label>
        )}
        <input
          type={type}
          className={cn(
            "flex h-14 w-full rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm",
            "ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none",
            "focus-visible:border-[#BFFF00] focus-visible:ring-0 focus-visible:ring-offset-0",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-colors duration-200",
            className
          )}
          onFocus={() => setIsFocused(true)}
          onBlur={(e) => {
            setIsFocused(false)
            setHasValue(Boolean(e.target.value))
          }}
          ref={ref}
          {...props}
        />
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }

