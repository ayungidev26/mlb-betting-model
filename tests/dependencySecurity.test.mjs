import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const packageJson = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")
)

test("production dependency manifest remains aligned with the lock file", () => {
  const packageLock = JSON.parse(
    fs.readFileSync(new URL("../package-lock.json", import.meta.url), "utf8")
  )

  assert.equal(
    packageJson.dependencies.next,
    packageLock.packages[""].dependencies.next
  )
})
