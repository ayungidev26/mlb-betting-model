function getRequestHeader(req, headerName) {
  if (!req?.headers) return null

  const directHeader = req.headers[headerName]

  if (typeof directHeader === "string") {
    return directHeader
  }

  const normalizedHeader = req.headers[headerName.toLowerCase()]

  if (typeof normalizedHeader === "string") {
    return normalizedHeader
  }

  return null
}

export function getCronSecret() {
  return process.env.CRON_SECRET?.trim() || null
}

export function getOperationalRouteSecret() {
  return process.env.ADMIN_API_SECRET?.trim() || getCronSecret()
}

function parseBearerToken(req) {
  const missingAuthError =
    req?.missingAuthErrorMessage || "Missing Authorization header"
  const authorizationHeader = getRequestHeader(req, "authorization")
  const adminSecretHeader = getRequestHeader(req, "x-admin-secret")
  const bodyAdminSecret =
    typeof req?.body?.adminSecret === "string" ? req.body.adminSecret : null
  const bodyAuthToken =
    typeof req?.body?.authToken === "string" ? req.body.authToken : null

  if (adminSecretHeader) {
    return {
      ok: true,
      token: adminSecretHeader.trim()
    }
  }

  if (bodyAdminSecret) {
    return {
      ok: true,
      token: bodyAdminSecret.trim()
    }
  }

  if (bodyAuthToken) {
    return {
      ok: true,
      token: bodyAuthToken.trim()
    }
  }

  if (!authorizationHeader) {
    return {
      ok: false,
      statusCode: 401,
      error: missingAuthError
    }
  }

  const [scheme, token] = authorizationHeader.split(" ")

  if (scheme !== "Bearer" || !token) {
    return {
      ok: false,
      statusCode: 401,
      error: "Authorization header must use Bearer token"
    }
  }

  return {
    ok: true,
    token
  }
}

function requireBearerTokenMatch(req, res, options) {
  const {
    allowedMethods,
    expectedToken,
    missingSecretError,
    missingAuthErrorMessage
  } = options

  if (!allowedMethods.includes(req.method)) {
    res.setHeader("Allow", allowedMethods)
    res.status(405).json({
      error: `Method ${req.method} Not Allowed`
    })
    return false
  }

  if (!expectedToken) {
    res.status(503).json({
      error: missingSecretError
    })
    return false
  }

  const bearerToken = parseBearerToken({
    ...req,
    missingAuthErrorMessage
  })

  if (!bearerToken.ok) {
    res.status(bearerToken.statusCode).json({
      error: bearerToken.error
    })
    return false
  }

  if (bearerToken.token !== expectedToken) {
    res.status(403).json({
      error: "Invalid bearer token"
    })
    return false
  }

  return true
}

export function requireOperationalRouteAccess(req, res) {
  return requireBearerTokenMatch(req, res, {
    allowedMethods: ["POST"],
    expectedToken: getOperationalRouteSecret(),
    missingSecretError: "Admin API secret is not configured"
  })
}

export function requireCronRouteAccess(req, res) {
  return requireBearerTokenMatch(req, res, {
    allowedMethods: ["GET", "POST"],
    expectedToken: getCronSecret(),
    missingSecretError: "CRON_SECRET is not configured",
    missingAuthErrorMessage:
      "Missing Authorization header. Configure CRON_SECRET in Vercel so scheduled cron invocations include Bearer auth."
  })
}
