"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Filter } from "lucide-react"

export interface Filters {
  category: string
  status: string
  dateRange: {
    from: string
    to: string
  }
}

interface FilterDialogProps {
  filters: Filters
  onFilterChange: (key: keyof Filters, value: any) => void
  onReset: () => void
}

export function FilterDialog({ filters, onFilterChange, onReset }: FilterDialogProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="hover:bg-[#BFFF00] hover:text-black">
          <Filter className="w-4 h-4 text-black" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="bg-gray-950 border-gray-800">
        <SheetHeader>
          <SheetTitle className="text-white">Filtres</SheetTitle>
        </SheetHeader>
        <div className="space-y-6 mt-6">
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Catégorie</label>
            <Select
              value={filters.category}
              onValueChange={(value) => onFilterChange("category", value)}
            >
              <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                <SelectValue placeholder="Sélectionnez une catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="Landing Page">Landing Page</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
                <SelectItem value="Design">Design</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-2 block">Status</label>
            <Select
              value={filters.status}
              onValueChange={(value) => onFilterChange("status", value)}
            >
              <SelectTrigger className="bg-gray-900 border-gray-800 text-white">
                <SelectValue placeholder="Sélectionnez un status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="PUBLISHED">Publiés</SelectItem>
                <SelectItem value="DRAFT">Brouillons</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-2 block">Période</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  type="date"
                  value={filters.dateRange.from}
                  onChange={(e) => onFilterChange("dateRange", {
                    ...filters.dateRange,
                    from: e.target.value
                  })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
              </div>
              <div>
                <Input
                  type="date"
                  value={filters.dateRange.to}
                  onChange={(e) => onFilterChange("dateRange", {
                    ...filters.dateRange,
                    to: e.target.value
                  })}
                  className="bg-gray-900 border-gray-800 text-white"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-4 mt-6">
          <Button 
            variant="outline" 
            onClick={onReset}
            className="border-gray-800 text-black hover:bg-[#BFFF00] hover:text-black"
          >
            Réinitialiser
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
} 