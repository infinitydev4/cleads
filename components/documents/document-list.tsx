"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"
import { DocumentStatus } from "@prisma/client"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  ArrowUpRight,
  Download,
  FileText,
  MoreVertical,
  XCircle,
  Share2,
} from "lucide-react"

interface Document {
  id: string
  number: string
  client: string
  date: string
  amount: number
  status: DocumentStatus
  type: "INVOICE" | "QUOTE"
}

export function DocumentList() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const activeType = searchParams.get("type") || "INVOICE"

  useEffect(() => {
    fetchDocuments()
  }, [activeType])

  const fetchDocuments = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch(`/api/documents?type=${activeType}`)
      if (!response.ok) throw new Error("Erreur lors du chargement des documents")
      const data = await response.json()
      setDocuments(data)
    } catch (err) {
      setError("Une erreur est survenue lors du chargement des documents")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = async (doc: Document) => {
    try {
      const response = await fetch(`/api/documents/${doc.id}/pdf`)
      if (!response.ok) throw new Error("Erreur lors du téléchargement")
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${doc.number}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error(err)
      toast.error("Erreur lors du téléchargement")
    }
  }

  const handleSend = async (doc: Document) => {
    try {
      const response = await fetch(`/api/documents/${doc.id}/send`, {
        method: "POST",
      })
      if (!response.ok) throw new Error("Erreur lors de l'envoi")
      toast.success("Document envoyé avec succès")
      fetchDocuments()
    } catch (err) {
      console.error(err)
      toast.error("Erreur lors de l'envoi")
    }
  }

  const handleShare = async (doc: Document) => {
    try {
      const response = await fetch(`/api/documents/${doc.id}/share`, {
        method: "POST",
      })
      if (!response.ok) throw new Error("Erreur lors du partage")
      toast.success("Document partagé avec succès")
      fetchDocuments()
    } catch (err) {
      console.error(err)
      toast.error("Erreur lors du partage")
    }
  }

  const handleEdit = (doc: Document) => {
    router.push(`/dashboard/billing/${doc.type === "INVOICE" ? "invoice" : "quote"}/${doc.id}`)
  }

  const handleDelete = async (doc: Document) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce document ?")) return
    
    try {
      const response = await fetch(`/api/documents/${doc.id}`, {
        method: "DELETE",
      })
      if (!response.ok) throw new Error("Erreur lors de la suppression")
      toast.success("Document supprimé avec succès")
      fetchDocuments()
    } catch (err) {
      console.error(err)
      toast.error("Erreur lors de la suppression")
    }
  }

  const getStatusColor = (status: DocumentStatus) => {
    switch (status) {
      case "DRAFT":
        return "bg-gray-900 text-gray-400"
      case "SENT":
        return "bg-blue-900 text-blue-400"
      case "PAID":
        return "bg-green-900 text-green-400"
      case "OVERDUE":
        return "bg-red-900 text-red-400"
      default:
        return "bg-gray-900 text-gray-400"
    }
  }

  const getStatusLabel = (status: DocumentStatus) => {
    switch (status) {
      case "DRAFT":
        return "Brouillon"
      case "SENT":
        return "Envoyé"
      case "PAID":
        return "Payé"
      case "OVERDUE":
        return "En retard"
      default:
        return status
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#BFFF00]"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <XCircle className="h-8 w-8 text-red-500 mb-2" />
        <p className="text-gray-400">{error}</p>
        <Button
          variant="outline"
          className="mt-4 border-gray-800 text-black hover:bg-[#BFFF00] hover:text-black"
          onClick={() => fetchDocuments()}
        >
          Réessayer
        </Button>
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <FileText className="h-8 w-8 text-gray-400 mb-2" />
        <p className="text-gray-400">Aucun document trouvé</p>
        <Button
          className="mt-4 bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
          onClick={() => router.push(`/dashboard/billing/new/${activeType.toLowerCase()}`)}
        >
          Créer un {activeType === "INVOICE" ? "facture" : "devis"}
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left p-4 text-sm font-medium text-gray-400">Numéro</th>
            <th className="text-left p-4 text-sm font-medium text-gray-400">Client</th>
            <th className="text-left p-4 text-sm font-medium text-gray-400">Date</th>
            <th className="text-right p-4 text-sm font-medium text-gray-400">Montant</th>
            <th className="text-left p-4 text-sm font-medium text-gray-400">Statut</th>
            <th className="text-right p-4 text-sm font-medium text-gray-400">Actions</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id} className="border-b border-gray-800 hover:bg-gray-900/50">
              <td className="p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-gray-400" />
                  <span className="font-medium text-white">{doc.number}</span>
                </div>
              </td>
              <td className="p-4">
                <span className="text-white">{doc.client}</span>
              </td>
              <td className="p-4">
                <span className="text-gray-400">{new Date(doc.date).toLocaleDateString()}</span>
              </td>
              <td className="p-4 text-right">
                <span className="font-medium text-white">
                  {doc.amount.toLocaleString()}€
                </span>
              </td>
              <td className="p-4">
                <div className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium", getStatusColor(doc.status))}>
                  {getStatusLabel(doc.status)}
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
                    <DropdownMenuItem onClick={() => handleDownload(doc)}>
                      <Download className="h-4 w-4 mr-2" />
                      Télécharger
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleShare(doc)}>
                      <Share2 className="h-4 w-4 mr-2" />
                      Partager
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSend(doc)}>
                      <ArrowUpRight className="h-4 w-4 mr-2" />
                      Envoyer
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleEdit(doc)}>
                      Modifier
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="text-red-500"
                      onClick={() => handleDelete(doc)}
                    >
                      Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
} 