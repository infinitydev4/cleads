import type { MetadataRoute } from "next"

const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://cleads.fr").replace(/\/$/, "")

// Only indexable pages, no invented lastModified dates.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${baseUrl}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${baseUrl}/mentions-legales`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/politique-de-confidentialite`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/cgv`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/cookies`, changeFrequency: "yearly", priority: 0.2 },
  ]
}
