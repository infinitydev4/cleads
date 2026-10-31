import Image from "next/image"
import { notFound } from "next/navigation"
import { unsubscribeStatus } from "@/features/outreach/unsubscribe"
import { UnsubscribeButton } from "./unsubscribe-button"

export const metadata = { title: "Ne plus recevoir nos emails" }
export const dynamic = "force-dynamic"

/** Opening the page changes nothing (mail scanners open links): the person confirms with one button. */
export default async function UnsubscribePage(props: { params: Promise<{ token: string }> }) {
  const token = decodeURIComponent((await props.params).token)
  const status = await unsubscribeStatus(token)
  if (!status) notFound()
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 py-8 sm:py-14">
      <Image src="/logo-white.svg" alt="Cleads" width={120} height={32} className="mb-8" priority />
      <UnsubscribeButton token={token} email={status.email} done={status.done} />
    </main>
  )
}
