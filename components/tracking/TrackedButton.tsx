"use client"

import { Button } from "@/components/ui/button"
import { useConversionTracking } from "@/hooks/useConversionTracking"
import type { ButtonProps } from "@/components/ui/button"
import { ComponentPropsWithoutRef } from "react"

interface TrackedButtonProps extends ButtonProps {
  trackingName: string
  location: string
  children: React.ReactNode
  onClick?: ComponentPropsWithoutRef<"button">["onClick"]
  icon?: React.ReactNode
}

export function TrackedButton({ 
  trackingName, 
  location,
  onClick,
  children,
  icon,
  className,
  variant = "3d",
  size = "lg",
  ...props 
}: TrackedButtonProps) {
  const { trackCTA } = useConversionTracking()

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    trackCTA(trackingName, location)
    onClick?.(e)
  }

  return (
    <Button 
      variant={variant}
      size={size}
      onClick={handleClick}
      className={className}
      {...props}
    >
      <span className="relative flex items-center gap-2">
        {icon}
        {children}
        <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:animate-shimmer" />
      </span>
    </Button>
  )
} 