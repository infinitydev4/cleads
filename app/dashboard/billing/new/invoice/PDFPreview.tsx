"use client"

import dynamic from "next/dynamic"
import { PDFWrapper } from "@/components/pdf/PDFWrapper"

const InvoicePDF = dynamic(
  () => import("@/components/documents/InvoicePDF").then(mod => mod.InvoicePDF),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#BFFF00]"></div>
      </div>
    )
  }
)

interface PDFPreviewProps {
  invoice: any
  company: any
}

export default function PDFPreview({ invoice, company }: PDFPreviewProps) {
  return (
    <PDFWrapper>
      <InvoicePDF invoice={invoice} company={company} />
    </PDFWrapper>
  )
} 