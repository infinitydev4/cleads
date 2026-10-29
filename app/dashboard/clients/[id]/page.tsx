"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { ArrowLeft, Loader2, Mail, Phone, Star, StarOff } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface Client {
  id: string
  name: string
  email: string
  phone: string
  avatar?: string | null
  favorite: boolean
  totalAppointments: number
}

interface ClientAppointment {
  id: string
  email: string
  date: string
  status: string
  type: string
  notes?: string | null
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [appointments, setAppointments] = useState<ClientAppointment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/clients/${id}`)
        if (!res.ok) throw new Error()
        const data: Client = await res.json()
        setClient(data)
        const all = await fetch("/api/appointments")
        if (all.ok) {
          const list: ClientAppointment[] = await all.json()
          setAppointments(list.filter((a) => a.email === data.email))
        }
      } catch {
        toast.error("Fiche introuvable")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  async function toggleFavorite() {
    if (!client) return
    const favorite = !client.favorite
    setClient({ ...client, favorite })
    const res = await fetch(`/api/clients/${client.id}/favorite`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite }),
    })
    if (!res.ok) {
      setClient({ ...client, favorite: !favorite })
      toast.error("La mise à jour a échoué")
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Chargement" />
      </div>
    )
  }
  if (!client) {
    return <p className="p-6 text-gray-400">Cette fiche n&apos;existe pas.</p>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href="/dashboard/clients" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Retour aux clients
      </Link>

      <section className="flex items-start justify-between gap-4 rounded-2xl border border-gray-800 bg-gray-950 p-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={client.avatar ?? undefined} alt="" />
            <AvatarFallback>{client.name?.slice(0, 2).toUpperCase() || "?"}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-white">{client.name}</h1>
            <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white">
              <Mail className="h-4 w-4" /> {client.email}
            </a>
            <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white">
              <Phone className="h-4 w-4" /> {client.phone}
            </a>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={toggleFavorite} aria-label={client.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}>
          {client.favorite ? <Star className="h-5 w-5 fill-[#BFFF00] text-[#BFFF00]" /> : <StarOff className="h-5 w-5 text-gray-400" />}
        </Button>
      </section>

      <section className="space-y-3 rounded-2xl border border-gray-800 bg-gray-950 p-6">
        <h2 className="text-lg font-semibold text-white">Rendez-vous ({appointments.length})</h2>
        {appointments.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun rendez-vous.</p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {appointments.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3 text-sm">
                <span className="text-gray-200">{format(new Date(a.date), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })}</span>
                <span className="text-gray-400">{a.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
