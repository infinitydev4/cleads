import { DocumentType, DocumentStatus, SharedDocumentType } from "@prisma/client"

export interface Document {
  id: string
  type: DocumentType
  number: string
  date: string
  dueDate: string | null
  client: string
  amount: number
  status: DocumentStatus
  items: {
    id: string
    description: string
    quantity: number
    price: number
    total: number
    details: string | null
  }[]
  company: {
    id: string
    name: string
    address: string
    city: string
    email: string
    phone: string
    siret: string | null
    tva: string | null
    website: string | null
  } | null
  subtotal: number
  taxType: string
  taxValue: number
  tax: number
  total: number
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface SharedDocument {
  id: string
  name: string
  type: SharedDocumentType
  url: string
  description: string | null
  size: number
  mimeType: string
  createdAt: string
  updatedAt: string
  isShared: boolean
  sharedBy: "ADMIN" | "USER"
} 