"use client"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-black">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#BFFF00]/10 via-transparent to-transparent" />
      <div className="relative">
        {children}
      </div>
    </div>
  )
} 