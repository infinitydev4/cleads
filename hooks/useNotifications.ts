import { useState, useEffect } from "react"
import Pusher from "pusher-js"
import { useSession } from "next-auth/react"

export interface Notification {
  id: string
  type: "APPOINTMENT" | "CLIENT" | "SYSTEM"
  title: string
  message: string
  createdAt: Date
  read: boolean
}

export function useNotifications() {
  const { data: session } = useSession()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!session?.user?.email) return

    // La liste des notifications fonctionne sans temps réel ; seul le push en direct a besoin de la clé Pusher.
    // Sans clé (ou si Pusher refuse de démarrer), on garde la liste et on n'abat jamais la page : tout le CRM monte ce hook.
    fetchNotifications()
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY
    if (!key) return

    let pusher: Pusher
    try {
      pusher = new Pusher(key, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        authEndpoint: "/api/pusher/auth",
      })
    } catch (error) {
      console.error("[PUSHER]", error)
      return
    }

    // S'abonner au canal de l'utilisateur
    const channel = pusher.subscribe(`private-user-${session.user.email}`)

    // Écouter les nouveaux rendez-vous
    channel.bind("new-appointment", (data: any) => {
      const notification: Notification = {
        id: data.id,
        type: "APPOINTMENT",
        title: "Nouveau rendez-vous",
        message: `${data.clientName} a réservé un rendez-vous pour ${new Date(data.date).toLocaleDateString("fr-FR")}`,
        createdAt: new Date(),
        read: false,
      }
      addNotification(notification)
    })

    // Écouter les modifications de rendez-vous
    channel.bind("appointment-updated", (data: any) => {
      const notification: Notification = {
        id: data.id,
        type: "APPOINTMENT",
        title: "Rendez-vous modifié",
        message: `Le rendez-vous avec ${data.clientName} a été modifié`,
        createdAt: new Date(),
        read: false,
      }
      addNotification(notification)
    })

    // Écouter les annulations de rendez-vous
    channel.bind("appointment-cancelled", (data: any) => {
      const notification: Notification = {
        id: data.id,
        type: "APPOINTMENT",
        title: "Rendez-vous annulé",
        message: `Le rendez-vous avec ${data.clientName} a été annulé`,
        createdAt: new Date(),
        read: false,
      }
      addNotification(notification)
    })

    return () => {
      channel.unbind_all()
      pusher.unsubscribe(`private-user-${session.user.email}`)
    }
  }, [session?.user?.email])

  const addNotification = (notification: Notification) => {
    setNotifications(prev => [notification, ...prev])
    setUnreadCount(prev => prev + 1)
  }

  const fetchNotifications = async () => {
    try {
      const response = await fetch("/api/notifications")
      if (!response.ok) throw new Error("Erreur lors de la récupération des notifications")
      const data = await response.json()
      setNotifications(data)
      setUnreadCount(data.filter((n: Notification) => !n.read).length)
    } catch (error) {
      console.error("Erreur:", error)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: "PUT",
      })
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, read: true } : n
        )
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      console.error("Erreur:", error)
    }
  }

  const markAllAsRead = async () => {
    try {
      await fetch("/api/notifications/read-all", {
        method: "PUT",
      })
      setNotifications(prev =>
        prev.map(n => ({ ...n, read: true }))
      )
      setUnreadCount(0)
    } catch (error) {
      console.error("Erreur:", error)
    }
  }

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  }
} 