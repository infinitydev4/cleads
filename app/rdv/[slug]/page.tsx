import Image from "next/image"
import { notFound } from "next/navigation"
import { LeadError } from "@/features/leads/errors"
import { publicProfile } from "@/features/meetings/service"
import { BookingFlow } from "./booking-flow"

export const dynamic = "force-dynamic"

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  try {
    const p = await publicProfile((await props.params).slug)
    return { title: `Rendez-vous avec ${p.hostName}` }
  } catch {
    return { title: "Prendre rendez-vous" }
  }
}

export default async function BookingPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  let profile
  try {
    profile = await publicProfile(slug)
  } catch (error) {
    if (error instanceof LeadError && error.code === "not_found") notFound()
    throw error
  }
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 py-8 sm:py-14">
      <Image src="/logo-white.svg" alt="Cleads" width={120} height={32} className="mb-8" priority />
      <BookingFlow slug={slug} profile={profile} />
    </main>
  )
}
