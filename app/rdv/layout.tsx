import type { Metadata } from "next"

// Booking pages are for people who received the link: never indexed, never cached.
export const metadata: Metadata = {
  title: { default: "Prendre rendez-vous", template: "%s · Cleads" },
  robots: { index: false, follow: false, nocache: true },
}

export default function RdvLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>
}
