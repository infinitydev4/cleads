"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { LeadDetail } from "@/features/leads/types"
import type { Assignee } from "../filter-bar"
import { LeadDetailView } from "../lead-detail-view"

export function LeadPageClient({ initial, assignees, currentUserId }: { initial: LeadDetail; assignees: Assignee[]; currentUserId: string }) {
  const router = useRouter()
  const [lead, setLead] = useState(initial)
  return <LeadDetailView lead={lead} assignees={assignees} currentUserId={currentUserId} onChange={setLead} onDeleted={() => router.push("/app/leads")} />
}
