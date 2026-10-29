import { prisma } from "./prisma"
import { notifications } from "./notifications"

export async function sendAppointmentReminders() {
  try {
    // Récupérer tous les rendez-vous de demain
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    const tomorrowEnd = new Date(tomorrow)
    tomorrowEnd.setHours(23, 59, 59, 999)

    const appointments = await prisma.appointment.findMany({
      where: {
        date: {
          gte: tomorrow,
          lte: tomorrowEnd,
        },
        status: "CONFIRMED",
      },
      include: {
        user: true,
      },
    })

    // Envoyer des rappels pour chaque rendez-vous
    for (const appointment of appointments) {
      await notifications.appointmentReminder(appointment.userId, appointment)
    }

    return appointments.length
  } catch (error) {
    console.error("[APPOINTMENT_REMINDERS]", error)
    throw error
  }
} 