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
  assert.equal(packageJson.devDependencies.eslint, "10.2.1")
  assert.equal(
    packageJson.devDependencies.eslint,
    packageLock.packages[""].devDependencies.eslint
  )
  assert.equal(packageLock.packages["node_modules/eslint"].version, "10.2.1")
  assert.equal(packageJson.overrides.sharp, "^0.35.0")
  assert.equal(packageJson.overrides.nanoid, "^3.3.17")
  assert.equal(packageJson.overrides.postcss, "^8.5.23")
  assert.equal(packageLock.packages["node_modules/nanoid"].version, "3.3.18")
  assert.equal(packageLock.packages["node_modules/postcss"].version, "8.5.26")
  assert.equal(packageLock.packages["node_modules/sharp"].version, "0.35.3")
})
