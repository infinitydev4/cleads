import { NextResponse } from "next/server"
import { sendAppointmentReminders } from "@/lib/appointment-reminders"

export async function POST(request: Request) {
  try {
    // Vérifier le secret pour la sécurité
    const authHeader = request.headers.get("authorization")
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
    }

    const count = await sendAppointmentReminders()

    return NextResponse.json({
      success: true,
      message: `${count} rappels de rendez-vous envoyés`,
    })
  } catch (error) {
    console.error("[CRON_APPOINTMENT_REMINDERS]", error)
    return NextResponse.json(
      { error: "Erreur lors de l'envoi des rappels" },
      { status: 500 }
    )
  }
} 