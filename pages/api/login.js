import {
  buildLogoutCookie,
  buildSessionCookie,
  createSessionToken,
  getSessionExpirationTimestamp,
  isValidPassword
} from "../../lib/appAuth.js"
import { getMissingAuthEnvironmentVariables } from "../../lib/authConfig.js"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).json({ error: "Method not allowed" })
  }

  const configuredPassword = process.env.APP_PASSWORD
  const signingSecret = process.env.SESSION_SIGNING_SECRET

  const missingConfiguration = getMissingAuthEnvironmentVariables()

  if (missingConfiguration.length > 0) {
    return res.status(500).json({
      error: "Authentication is not configured",
      missing: missingConfiguration
    })
  }

  const submittedPassword = typeof req.body?.password === "string"
    ? req.body.password
    : ""

  const passwordMatches = await isValidPassword(submittedPassword, configuredPassword)

  if (!passwordMatches) {
    res.setHeader("Set-Cookie", buildLogoutCookie())
    return res.status(401).json({ error: "Incorrect password" })
  }

  const sessionToken = await createSessionToken(signingSecret)

  res.setHeader("Set-Cookie", buildSessionCookie(sessionToken))

  return res.status(200).json({
    success: true,
    sessionExpiresAt: getSessionExpirationTimestamp(sessionToken)
  })
}
