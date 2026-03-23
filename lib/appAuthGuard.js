export function buildLoginRedirectPath(pathname = "/", search = "") {
  if (!pathname || pathname === "/") {
    return "/login"
  }

  const params = new URLSearchParams({
    next: `${pathname}${search}`
  })

  return `/login?${params.toString()}`
}
