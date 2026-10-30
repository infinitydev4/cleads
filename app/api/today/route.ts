import { NextResponse } from "next/server"
import { getCurrentUser, AuthError } from "@/lib/auth/guard"
import { handleError } from "@/lib/api"
import { getToday } from "@/features/activity/today"

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) throw new AuthError(401)
    const scope = new URL(request.url).searchParams.get("scope") === "team" ? "team" : "mine"
    return NextResponse.json(await getToday(user, scope))
  } catch (error) {
    return handleError(error)
  }
}
