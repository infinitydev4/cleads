import type { Metadata } from "next"

// Reached from a prospecting email only: never indexed, never cached.
export const metadata: Metadata = {
  title: { default: "Désinscription", template: "%s · Cleads" },
  robots: { index: false, follow: false, nocache: true },
}

export default function UnsubscribeLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>
}
