import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contact | Cleads - Landing Pages Haute Performance",
  description: "Contactez Cleads pour discuter de votre projet de landing page. Notre équipe d'experts est là pour vous aider à maximiser vos conversions.",
  openGraph: {
    title: "Contact | Cleads - Landing Pages Haute Performance",
    description: "Contactez Cleads pour discuter de votre projet de landing page. Notre équipe d'experts est là pour vous aider à maximiser vos conversions.",
  }
}

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
} 