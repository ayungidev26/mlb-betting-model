import { NextResponse } from "next/server"

import { isValidSession, readSessionCookie } from "./lib/appAuth.js"
import { buildLoginRedirectPath } from "./lib/appAuthGuard.js"
import { getMissingAuthEnvironmentVariables } from "./lib/authConfig.js"

export async function middleware(req) {
  const { pathname, search } = req.nextUrl

  const isPublicAuthRoute = pathname.startsWith("/api/login")
    || pathname.startsWith("/api/logout")
    || pathname === "/login"
  const isCronApiRoute = pathname.startsWith("/api/cron/")
  const isOperationalApiRoute = pathname.startsWith("/api/runPipeline")
    || pathname.startsWith("/api/runStatsPipeline")

  if (isPublicAuthRoute || isCronApiRoute || isOperationalApiRoute) {
    return NextResponse.next()
  }

  const signingSecret = process.env.SESSION_SIGNING_SECRET
  const missingConfiguration = getMissingAuthEnvironmentVariables()

  if (missingConfiguration.length > 0) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("error", "config")
    loginUrl.searchParams.set("missing", missingConfiguration.join(","))
    return NextResponse.redirect(loginUrl)
  }

  const sessionToken = readSessionCookie(req.headers.get("cookie") || "")
  const hasValidSession = await isValidSession(sessionToken, signingSecret)

  if (hasValidSession) {
    return NextResponse.next()
  }

  return NextResponse.redirect(new URL(buildLoginRedirectPath(pathname, search), req.url))
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
}
