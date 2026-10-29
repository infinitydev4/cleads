import { NextResponse } from "next/server"

export async function GET() {
  try {
    const response = await fetch("https://ipapi.co/json/", {
      headers: {
        "Accept": "application/json",
      },
      next: { revalidate: 3600 }, // Cache pour 1 heure
    })
    
    if (!response.ok) {
      // En cas d'erreur, retourner la France par défaut
      return NextResponse.json({
        country_code: "FR",
        country_name: "France",
        dial_code: "+33",
        flag: "🇫🇷"
      })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("Erreur IP API:", error)
    // En cas d'erreur, retourner la France par défaut
    return NextResponse.json({
      country_code: "FR",
      country_name: "France",
      dial_code: "+33",
      flag: "🇫🇷"
    })
  }
} 