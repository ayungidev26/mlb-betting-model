import test from "node:test"
import assert from "node:assert/strict"

const MODULE_PATH = new URL("../lib/upstash.js", import.meta.url)

async function importUpstashModule() {
  return import(`${MODULE_PATH.href}?t=${Date.now()}-${Math.random()}`)
}

async function withRedisEnv(envOverrides, callback) {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN

  if (envOverrides.UPSTASH_REDIS_REST_URL === undefined) {
    delete process.env.UPSTASH_REDIS_REST_URL
  } else {
    process.env.UPSTASH_REDIS_REST_URL = envOverrides.UPSTASH_REDIS_REST_URL
  }

  if (envOverrides.UPSTASH_REDIS_REST_TOKEN === undefined) {
    delete process.env.UPSTASH_REDIS_REST_TOKEN
  } else {
    process.env.UPSTASH_REDIS_REST_TOKEN = envOverrides.UPSTASH_REDIS_REST_TOKEN
  }

  try {
    return await callback()
  } finally {
    if (originalUrl === undefined) {
      delete process.env.UPSTASH_REDIS_REST_URL
    } else {
      process.env.UPSTASH_REDIS_REST_URL = originalUrl
    }

    if (originalToken === undefined) {
      delete process.env.UPSTASH_REDIS_REST_TOKEN
    } else {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken
    }
  }
}

test("boot-time redis config trims required env vars", async () => {
  await withRedisEnv(
    {
      UPSTASH_REDIS_REST_URL: "  https://example-upstash.test  ",
      UPSTASH_REDIS_REST_TOKEN: "  secret-token  "
    },
    async () => {
      const { getUpstashRedisConfig } = await importUpstashModule()

      assert.deepEqual(getUpstashRedisConfig(), {
        url: "https://example-upstash.test",
        token: "secret-token"
      })
    }
  )
})

test("boot-time redis config fails fast with a controlled configuration error", async () => {
  await withRedisEnv(
    {
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined
    },
    async () => {
      await assert.rejects(
        importUpstashModule(),
        (error) => {
          assert.equal(error.name, "RedisConfigurationError")
          assert.equal(error.code, "REDIS_CONFIGURATION_ERROR")
          assert.deepEqual(error.missingEnvVars, [
            "UPSTASH_REDIS_REST_URL",
            "UPSTASH_REDIS_REST_TOKEN"
          ])
          assert.match(error.message, /UPSTASH_REDIS_REST_URL/)
          assert.match(error.message, /UPSTASH_REDIS_REST_TOKEN/)
          return true
        }
      )
    }
  )
})
