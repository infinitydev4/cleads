"use client"

import { useEffect, useState, Suspense } from "react"
import { PDFViewer } from "@react-pdf/renderer"

interface PDFWrapperProps {
  children: React.ReactNode
}

export function PDFWrapper({ children }: PDFWrapperProps) {
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  if (!isClient) {
    return (
      <div className="flex items-center justify-center w-full h-[calc(100vh-200px)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#BFFF00]"></div>
      </div>
    )
  }

  return (
    <div className="w-full h-[calc(100vh-200px)]">
      <PDFViewer width="100%" height="100%" className="rounded-xl">
        <Suspense fallback={
          <div className="flex items-center justify-center w-full h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#BFFF00]"></div>
          </div>
        }>
          {children}
        </Suspense>
      </PDFViewer>
    </div>
  )
} 