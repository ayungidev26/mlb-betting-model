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

function getAdminApiSecret() {
  return process.env.ADMIN_API_SECRET || process.env.CRON_SECRET || null
}

export function requireOperationalRouteAccess(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"])

    res.status(405).json({
      error: `Method ${req.method} Not Allowed`
    })

    return false
  }

  const expectedToken = getAdminApiSecret()

  if (!expectedToken) {
    res.status(503).json({
      error: "Admin API secret is not configured"
    })

    return false
  }

  const authorizationHeader = getRequestHeader(req, "authorization")

  if (!authorizationHeader) {
    res.status(401).json({
      error: "Missing Authorization header"
    })

    return false
  }

  const [scheme, token] = authorizationHeader.split(" ")

  if (scheme !== "Bearer" || !token) {
    res.status(401).json({
      error: "Authorization header must use Bearer token"
    })

    return false
  }

  if (token !== expectedToken) {
    res.status(403).json({
      error: "Invalid bearer token"
    })

    return false
  }

  return true
}
