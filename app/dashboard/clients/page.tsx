"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  Search,
  Filter,
  Grid2X2,
  List,
  MoreVertical,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Star,
  StarOff,
  Plus
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Link from "next/link"
import { toast } from "sonner"

type ViewMode = "grid" | "list"

interface Client {
  id: string
  name: string
  email: string
  phone: string
  location: string
  company: string
  lastContact: Date | null
  nextMeeting?: string
  avatar?: string
  status: "active" | "inactive"
  favorite: boolean
  totalAppointments: number
}

export default function ClientsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [searchQuery, setSearchQuery] = useState("")
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchClients = async () => {
      try {
        setLoading(true)
        console.log("Fetching clients from frontend...")
        const response = await fetch("/api/clients")
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Erreur lors de la récupération des clients")
        }
        const data = await response.json()
        console.log("Received clients data:", data)
        setClients(data)
      } catch (err) {
        console.error("Error fetching clients:", err)
        setError(err instanceof Error ? err.message : "Une erreur est survenue")
      } finally {
        setLoading(false)
      }
    }

    fetchClients()
  }, [])

  const filteredClients = clients.filter(client =>
    client.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const toggleFavorite = async (clientId: string) => {
    try {
      const response = await fetch(`/api/clients/${clientId}/favorite`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          favorite: !clients.find(c => c.id === clientId)?.favorite
        }),
      })

      if (!response.ok) {
        throw new Error("Erreur lors de la mise à jour du statut favori")
      }

      const updatedClient = await response.json()
      setClients(prevClients =>
        prevClients.map(client =>
          client.id === clientId
            ? { ...client, favorite: updatedClient.favorite }
            : client
        )
      )

      toast.success(
        updatedClient.favorite
          ? "Client ajouté aux favoris"
          : "Client retiré des favoris"
      )
    } catch (error) {
      console.error("Erreur:", error)
      toast.error("Erreur lors de la mise à jour du statut favori")
    }
  }

  const deleteClient = async (clientId: string) => {
    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Erreur lors de la suppression du client")
      }

      // Mettre à jour la liste des clients
      setClients(clients.filter(client => client.id !== clientId))
    } catch (error) {
      console.error("Erreur lors de la suppression:", error)
      alert(error instanceof Error ? error.message : "Erreur lors de la suppression du client")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#BFFF00]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            Clients ({filteredClients.length})
          </h1>
          <p className="text-gray-400">Gérez votre portefeuille clients</p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Rechercher un client..."
              className="pl-10 bg-gray-950 border-gray-800 text-white w-full sm:w-[300px]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-gray-950 border border-gray-800 rounded-lg p-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "px-3",
                viewMode === "grid" && "bg-gray-900 text-[#BFFF00]"
              )}
              onClick={() => setViewMode("grid")}
            >
              <Grid2X2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "px-3",
                viewMode === "list" && "bg-gray-900 text-[#BFFF00]"
              )}
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {/* Filter button */}
          <Button variant="outline" size="icon" className="border-gray-800 bg-[#BFFF00]">
            <Filter className="h-4 w-4 text-black" />
          </Button>

          {/* Add client button */}
          <Button className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90">
            <Plus className="h-4 w-4 mr-2" />
            Nouveau client
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-400">
              {searchQuery ? "Aucun client ne correspond à votre recherche" : "Aucun client trouvé"}
            </div>
          ) : (
            filteredClients.map((client) => (
              <motion.div
                key={client.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-950 border border-gray-800 rounded-xl p-6"
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-14 w-14">
                      <AvatarImage src={client.avatar} />
                      <AvatarFallback className="bg-gray-800 text-white">
                        {client.name ? client.name.split(" ").map(n => n[0]).join("") : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link 
                          href={`/dashboard/clients/${client.id}`} 
                          className="text-lg font-semibold text-white hover:text-[#BFFF00] transition-colors truncate"
                        >
                          {client.name}
                        </Link>
                      </div>
                      <p className="text-sm text-gray-400 truncate">{client.company}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-yellow-400 shrink-0"
                    onClick={() => toggleFavorite(client.id)}
                  >
                    {client.favorite ? (
                      <Star className="h-4 w-4 fill-current" />
                    ) : (
                      <StarOff className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span className="truncate">{client.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Phone className="h-4 w-4 shrink-0" />
                    <span className="truncate">{client.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="truncate">{client.location}</span>
                  </div>
                  {client.lastContact && (
                    <div className="flex items-center gap-2 text-sm text-[#BFFF00]">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <span className="truncate">Dernier contact: {new Date(client.lastContact).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                  <div className="text-sm">
                    <span className="text-gray-400">RDV: </span>
                    <span className="text-white font-medium">
                      {client.totalAppointments}
                    </span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboard/clients/${client.id}`}>
                          Voir le profil
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem>Modifier</DropdownMenuItem>
                      <DropdownMenuItem>Nouveau rendez-vous</DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
                        onClick={() => {
                          if (confirm("Êtes-vous sûr de vouloir supprimer ce client ?")) {
                            deleteClient(client.id)
                          }
                        }}
                      >
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Client
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-400 hidden md:table-cell">
                  Contact
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-400 hidden lg:table-cell">
                  Localisation
                </th>
                <th className="text-left p-4 text-sm font-medium text-gray-400">
                  Statut
                </th>
                <th className="text-right p-4 text-sm font-medium text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-gray-400">
                    {searchQuery ? "Aucun client ne correspond à votre recherche" : "Aucun client trouvé"}
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    className="border-b border-gray-800 hover:bg-gray-900/50"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={client.avatar} />
                          <AvatarFallback className="bg-gray-800 text-white">
                            {client.name ? client.name.split(" ").map(n => n[0]).join("") : "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-white flex items-center gap-2">
                            <Link href={`/dashboard/clients/${client.id}`} className="hover:text-[#BFFF00] transition-colors">
                              {client.name}
                            </Link>
                            {client.favorite && (
                              <Star className="h-4 w-4 text-yellow-400 fill-current" />
                            )}
                          </div>
                          <div className="text-sm text-gray-400">
                            {client.company}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <div className="text-sm">
                        <div>{client.email}</div>
                        <div className="text-gray-400">{client.phone}</div>
                      </div>
                    </td>
                    <td className="p-4 hidden lg:table-cell">
                      <div className="text-sm">{client.location}</div>
                    </td>
                    <td className="p-4">
                      <div
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
                          client.status === "active"
                            ? "bg-green-500/10 text-green-500"
                            : "bg-yellow-500/10 text-yellow-500"
                        )}
                      >
                        {client.status === "active" ? "Actif" : "Inactif"}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/clients/${client.id}`}>
                              Voir le profil
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem>Modifier</DropdownMenuItem>
                          <DropdownMenuItem>Nouveau rendez-vous</DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
                            onClick={() => {
                              if (confirm("Êtes-vous sûr de vouloir supprimer ce client ?")) {
                                deleteClient(client.id)
                              }
                            }}
                          >
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
} 