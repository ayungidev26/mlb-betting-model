const AUTH_ENVIRONMENT_VARIABLES = ["APP_PASSWORD", "SESSION_SIGNING_SECRET"]

export function getMissingAuthEnvironmentVariables(environment = process.env) {
  return AUTH_ENVIRONMENT_VARIABLES.filter((name) => !environment[name]?.trim())
}

export { AUTH_ENVIRONMENT_VARIABLES }
