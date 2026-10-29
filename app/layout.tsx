import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import GoogleTagManagerWrapper from "@/components/analytics/GoogleTagManagerWrapper"
import GoogleTagManagerNoScript from "@/components/analytics/GoogleTagManagerNoScript"
import { ConversionFunnel } from "@/components/tracking/ConversionFunnel"
import { Providers } from "./providers"
import ConditionalLayout from "../components/layout/conditional-layout"
import { CookieConsent } from "@/components/consent/CookieConsent"
import { CookieSettings } from "@/components/consent/CookieSettings"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://cleads.fr"),
  title: "Cleads - Landing Pages qui Convertissent",
  description: "Création de Landing Page en 72 heures. Copywriting adapté à votre audience. Des pages qui persuadent même les plus frileux de vos prospects.",
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
    <html lang="fr">
      <head>
        <GoogleTagManagerWrapper />
      </head>
      <body className={cn(
        "min-h-screen bg-gray-950 font-sans antialiased",
        inter.className
      )}>
        <GoogleTagManagerNoScript />
        <ConversionFunnel />
        <Providers>
          <ConditionalLayout>{children}</ConditionalLayout>
          <CookieConsent />
          <CookieSettings />
        </Providers>
      </body>
    </html>
  )
}

