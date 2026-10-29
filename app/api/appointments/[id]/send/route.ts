import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Resend } from "resend"
import { AppointmentConfirmation } from "@/components/emails/AppointmentConfirmation"
import { generatePassword } from "@/lib/utils"
import { format, addMinutes } from "date-fns"
import { fr } from "date-fns/locale"
import { hash } from "bcryptjs"
import { getAdminSession, unauthorized } from "@/lib/auth-guard"

const resend = new Resend(process.env.RESEND_API_KEY)

function generateCalendarLinks(appointment: any) {
  const startTime = new Date(appointment.date)
  const endTime = addMinutes(startTime, 30) // Rendez-vous de 30 minutes

  const event = {
    title: "Appel Stratégique - Cleads",
    description: "Consultation stratégique pour votre landing page",
    location: `Google Meet (${appointment.meetLink})`,
    startTime,
    endTime,
  }

  // Formater les dates pour Google Calendar
  const googleDates = `${startTime.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/g, '')}/${endTime.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/g, '')}`
  
  const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&details=${encodeURIComponent(event.description)}&location=${encodeURIComponent(event.location)}&dates=${googleDates}`
  
  const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(event.title)}&body=${encodeURIComponent(event.description)}&location=${encodeURIComponent(event.location)}&startdt=${startTime.toISOString()}&enddt=${endTime.toISOString()}`

  return { googleUrl, outlookUrl }
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) return unauthorized()
  const params = await props.params;
  try {
    // Récupérer le rendez-vous
    const appointment = await prisma.appointment.findUnique({
      where: {
        id: params.id,
      },
      include: {
        user: true,
      },
    })

    if (!appointment) {
      return new NextResponse("Rendez-vous non trouvé", { status: 404 })
    }

    // Générer un mot de passe temporaire pour l'utilisateur
    const temporaryPassword = generatePassword()
    
    // Hasher le mot de passe avant de le stocker
    const hashedPassword = await hash(temporaryPassword, 12)

    // Mettre à jour le mot de passe de l'utilisateur
    await prisma.user.update({
      where: {
        id: appointment.userId,
      },
      data: {
        password: hashedPassword,
        isTemporaryPassword: true
      },
    })

    // Générer le lien Google Meet
    const meetLink = `https://meet.google.com/${appointment.id}`

    // Formater la date et l'heure
    const formattedDate = format(appointment.date, "EEEE d MMMM yyyy", { locale: fr })
    const formattedTime = format(appointment.date, "HH:mm")

    // Générer les liens des calendriers
    const calendarLinks = generateCalendarLinks({
      ...appointment,
      meetLink,
    })

    // Envoyer l'email
    const { data, error } = await resend.emails.send({
      from: `Cleads <${process.env.RESEND_FROM_EMAIL}>`,
      to: [appointment.email],
      subject: "Confirmation de votre rendez-vous avec Cleads",
      react: AppointmentConfirmation({
        clientName: appointment.clientName,
        clientEmail: appointment.email,
        date: formattedDate,
        time: formattedTime,
        meetLink,
        generatedPassword: temporaryPassword,
        previewUrl: process.env.NEXT_PUBLIC_APP_URL || "https://cleads.fr",
        calendarLinks: {
          google: calendarLinks.googleUrl,
          outlook: calendarLinks.outlookUrl,
        },
      }),
    })

    if (error) {
      console.error("[EMAIL_SEND_ERROR]", error)
      return new NextResponse("Erreur lors de l'envoi de l'email", { status: 500 })
    }

    // Mettre à jour le statut du rendez-vous
    await prisma.appointment.update({
      where: {
        id: params.id,
      },
      data: {
        status: "CONFIRMED",
      },
    })

    return new NextResponse(JSON.stringify({ message: "Email de confirmation envoyé" }), {
      status: 200,
    })
  } catch (error) {
    console.error("[APPOINTMENT_CONFIRMATION_ERROR]", error)
    return new NextResponse("Erreur interne", { status: 500 })
  }
} 