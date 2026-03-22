const REQUIRED_ENV_VARS = {
  UPSTASH_REDIS_REST_URL: "url",
  UPSTASH_REDIS_REST_TOKEN: "token"
}

function deserializeRedisValue(value) {
  if (typeof value !== "string") {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export class RedisConfigurationError extends Error {
  constructor(missingEnvVars) {
    super(
      `Missing required Redis environment variables: ${missingEnvVars.join(", ")}`
    )
    this.name = "RedisConfigurationError"
    this.code = "REDIS_CONFIGURATION_ERROR"
    this.missingEnvVars = missingEnvVars
  }
}

export class UpstashRedisRestClient {
  constructor(config) {
    this.url = config.url
    this.token = config.token
  }

  async command(args) {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(args)
    })

    if (!response.ok) {
      throw new Error(`Upstash Redis request failed with status ${response.status}`)
    }

    const payload = await response.json()

    if (payload.error) {
      throw new Error(`Upstash Redis command failed: ${payload.error}`)
    }

    return payload.result
  }

  async get(key) {
    return deserializeRedisValue(await this.command(["GET", key]))
  }

  async set(key, value, options = null) {
    const args = ["SET", key, JSON.stringify(value)]

    if (typeof options?.ex === "number") {
      args.push("EX", String(options.ex))
    }

    if (options?.nx) {
      args.push("NX")
    }

    return this.command(args)
  }

  async del(key) {
    return this.command(["DEL", key])
  }

  async incr(key) {
    return this.command(["INCR", key])
  }

  async expire(key, seconds) {
    return this.command(["EXPIRE", key, String(seconds)])
  }

  async ttl(key) {
    return this.command(["TTL", key])
  }
}

export function getUpstashRedisConfig(env = process.env) {
  const config = {
    url: env.UPSTASH_REDIS_REST_URL?.trim(),
    token: env.UPSTASH_REDIS_REST_TOKEN?.trim()
  }

  const missingEnvVars = Object.entries(REQUIRED_ENV_VARS)
    .filter(([, configKey]) => !config[configKey])
    .map(([envVar]) => envVar)

  if (missingEnvVars.length > 0) {
    throw new RedisConfigurationError(missingEnvVars)
  }

  return config
}

export const redis = new UpstashRedisRestClient(getUpstashRedisConfig())
