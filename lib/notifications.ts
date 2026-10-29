import { pusher } from "./pusher"
import { prisma } from "./prisma"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

interface SendNotificationParams {
  userId: string
  type: string
  title: string
  message: string
  data?: any
}

export async function sendNotification({
  userId,
  type,
  title,
  message,
  data,
}: SendNotificationParams) {
  try {
    // Récupérer les paramètres de notification de l'utilisateur
    const settings = await prisma.notificationSettings.findUnique({
      where: { userId },
    })

    // Créer la notification dans la base de données
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        read: false,
      },
    })

    // Envoyer une notification push si activé
    if (settings?.push) {
      pusher.trigger(`private-user-${userId}`, "notification", {
        id: notification.id,
        type,
        title,
        message,
        data,
      })
    }

    // Envoyer un email si activé
    if (settings?.email) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      })

      if (user?.email) {
        await resend.emails.send({
          from: "Cleads <notifications@cleads.com>",
          to: user.email,
          subject: title,
          html: `
            <h1>${title}</h1>
            <p>${message}</p>
            ${data ? `<pre>${JSON.stringify(data, null, 2)}</pre>` : ""}
          `,
        })
      }
    }

    return notification
  } catch (error) {
    console.error("[SEND_NOTIFICATION]", error)
    throw error
  }
}

// Fonctions utilitaires pour différents types de notifications
export const notifications = {
  // Rendez-vous
  appointmentCreated: async (userId: string, appointment: any) => {
    return sendNotification({
      userId,
      type: "appointment",
      title: "Nouveau rendez-vous",
      message: `Un nouveau rendez-vous a été créé pour le ${new Date(appointment.date).toLocaleDateString()}`,
      data: appointment,
    })
  },

  appointmentReminder: async (userId: string, appointment: any) => {
    return sendNotification({
      userId,
      type: "appointment_reminder",
      title: "Rappel de rendez-vous",
      message: `Vous avez un rendez-vous demain à ${new Date(appointment.date).toLocaleTimeString()}`,
      data: appointment,
    })
  },

  appointmentChanged: async (userId: string, appointment: any) => {
    return sendNotification({
      userId,
      type: "appointment_changed",
      title: "Rendez-vous modifié",
      message: `Un rendez-vous a été modifié pour le ${new Date(appointment.date).toLocaleDateString()}`,
      data: appointment,
    })
  },

  appointmentCancelled: async (userId: string, appointment: any) => {
    return sendNotification({
      userId,
      type: "appointment_cancelled",
      title: "Rendez-vous annulé",
      message: `Un rendez-vous a été annulé pour le ${new Date(appointment.date).toLocaleDateString()}`,
      data: appointment,
    })
  },

  // Messages
  newMessage: async (userId: string, message: any) => {
    return sendNotification({
      userId,
      type: "message",
      title: "Nouveau message",
      message: `Vous avez reçu un nouveau message de ${message.sender}`,
      data: message,
    })
  },

  contactForm: async (userId: string, formData: any) => {
    return sendNotification({
      userId,
      type: "contact_form",
      title: "Nouveau message du formulaire de contact",
      message: `Un nouveau message a été envoyé via le formulaire de contact`,
      data: formData,
    })
  },

  // Système
  systemUpdate: async (userId: string, update: any) => {
    return sendNotification({
      userId,
      type: "system_update",
      title: "Mise à jour système",
      message: update.message,
      data: update,
    })
  },

  securityAlert: async (userId: string, alert: any) => {
    return sendNotification({
      userId,
      type: "security_alert",
      title: "Alerte de sécurité",
      message: alert.message,
      data: alert,
    })
  },
} 