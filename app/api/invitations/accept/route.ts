import { NextResponse } from "next/server"
import { handleError } from "@/lib/api"
import { clientIp } from "@/lib/request-ip"
import { acceptSchema } from "@/features/team/schemas"
import { acceptInvitation } from "@/features/team/service"

/** Public: the secret token in the body is the credential. The client signs in right after. */
export async function POST(request: Request) {
  try {
    const input = acceptSchema.parse(await request.json())
    const { email } = await acceptInvitation(input.token, { name: input.name, password: input.password }, clientIp(request.headers))
    return NextResponse.json({ success: true, email })
  } catch (error) {
    return handleError(error)
  }
}
