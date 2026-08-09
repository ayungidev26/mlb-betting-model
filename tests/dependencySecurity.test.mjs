import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const packageJson = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")
)

test("production dependency security floors remain pinned", () => {
  assert.equal(packageJson.dependencies.next, "15.5.21")
  assert.equal(packageJson.overrides.nanoid, "^3.3.17")
  assert.equal(packageJson.overrides.postcss, "^8.5.23")
  assert.equal(packageJson.overrides.sharp, "^0.35.0")
})
