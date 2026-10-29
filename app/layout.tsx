import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "../styles/tokens.css"
import "./globals.css"
import GoogleTagManagerWrapper from "@/components/analytics/GoogleTagManagerWrapper"
import GoogleTagManagerNoScript from "@/components/analytics/GoogleTagManagerNoScript"
import { Providers } from "./providers"
import ConditionalLayout from "../components/layout/conditional-layout"
import { CookieConsent } from "@/components/consent/CookieConsent"
import { CookieSettings } from "@/components/consent/CookieSettings"
import { PublicOnly } from "@/components/layout/public-only"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://cleads.fr"),
  title: "Cleads — Acquisition B2B externalisée et agents IA",
  description: "Transformez votre prospection en opportunités commerciales. Une équipe dédiée, une acquisition multicanale et des agents IA sur mesure.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" }
    ],
    apple: "/favicon.svg",
  },
  manifest: "/manifest.json",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: true,
  themeColor: "#000000",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" className="dark">
      <head>
        <PublicOnly>
          <GoogleTagManagerWrapper />
        </PublicOnly>
      </head>
      <body className={cn(
        "min-h-screen bg-gray-950 font-sans antialiased",
        inter.className
      )}>
        <PublicOnly>
          <GoogleTagManagerNoScript />
        </PublicOnly>
        <Providers>
          <ConditionalLayout>{children}</ConditionalLayout>
          <PublicOnly>
            <CookieConsent />
            <CookieSettings />
          </PublicOnly>
        </Providers>
      </body>
    </html>
  )
}

