import Image from "next/image"
import { notFound } from "next/navigation"
import { LeadError } from "@/features/leads/errors"
import { guestMeeting } from "@/features/meetings/service"
import { ManageMeeting } from "./manage"

export const metadata = { title: "Votre rendez-vous" }
export const dynamic = "force-dynamic"

export default async function ManagePage(props: { params: Promise<{ token: string }> }) {
  const token = decodeURIComponent((await props.params).token)
  let meeting
  try {
    meeting = await guestMeeting(token)
  } catch (error) {
    if (error instanceof LeadError && error.code === "not_found") notFound()
    throw error
  }
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 py-8 sm:py-14">
      <Image src="/logo-white.svg" alt="Cleads" width={120} height={32} className="mb-8" priority />
      <ManageMeeting initial={meeting} />
    </main>
  )
}
