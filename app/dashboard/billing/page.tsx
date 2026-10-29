"use client"

import { Suspense } from "react"
import { DocumentList } from "@/components/documents/document-list"
import { DocumentsHeader } from "@/components/documents/documents-header"
import { LoadingSpinner } from "@/components/ui/loading-spinner"

export default function BillingPage() {
  return (
    <div className="h-full flex-1 flex-col space-y-8 p-8 flex">
      <Suspense fallback={<LoadingSpinner />}>
        <DocumentsHeader />
      </Suspense>
      <Suspense fallback={<LoadingSpinner />}>
        <DocumentList />
      </Suspense>
    </div>
  )
} 