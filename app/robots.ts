import type { MetadataRoute } from "next"

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://cleads.fr").replace(/\/$/, "")

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/auth/", "/api/", "/rdv/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
