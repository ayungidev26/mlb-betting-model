import { NextResponse } from "next/server"

import { isValidSession, readSessionCookie } from "./lib/appAuth.js"
import { buildLoginRedirectPath } from "./lib/appAuthGuard.js"

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

  const configuredPassword = process.env.APP_PASSWORD

  if (!configuredPassword) {
    return NextResponse.redirect(new URL("/login?error=config", req.url))
  }

  const sessionToken = readSessionCookie(req.headers.get("cookie") || "")
  const hasValidSession = await isValidSession(sessionToken, configuredPassword)

  if (hasValidSession) {
    return NextResponse.next()
  }

  return NextResponse.redirect(new URL(buildLoginRedirectPath(pathname, search), req.url))
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
}
