"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Filter, Plus, Search } from "lucide-react"

export function DocumentsHeader() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeType = searchParams.get("type") || "INVOICE"

  const handleNewDocument = () => {
    router.push(`/dashboard/billing/new/${activeType.toLowerCase()}`)
  }

  const handleTypeChange = (type: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("type", type)
    router.push(`/dashboard/billing?${params.toString()}`)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            {activeType === "INVOICE" ? "Factures" : "Devis"}
          </h1>
          <p className="text-gray-400">Gérez vos documents financiers</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Button 
            className="bg-[#BFFF00] text-black hover:bg-[#BFFF00]/90"
            onClick={handleNewDocument}
          >
            <Plus className="h-4 w-4 mr-2 text-black" />
            Nouveau {activeType === "INVOICE" ? "facture" : "devis"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,auto] gap-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher un client..."
            className="pl-10 bg-gray-950 border-gray-800 text-white"
          />
        </div>

        <div className="flex items-center gap-1 bg-gray-950 border border-gray-800 rounded-lg p-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "px-3",
              activeType === "INVOICE" && "bg-gray-900 text-[#BFFF00]"
            )}
            onClick={() => handleTypeChange("INVOICE")}
          >
            Factures
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "px-3",
              activeType === "QUOTE" && "bg-gray-900 text-[#BFFF00]"
            )}
            onClick={() => handleTypeChange("QUOTE")}
          >
            Devis
          </Button>
        </div>

        <Button variant="outline" size="icon" className="border-gray-800 bg-[#BFFF00]">
          <Filter className="h-4 w-4 text-black" />
        </Button>
      </div>
    </div>
  )
} 