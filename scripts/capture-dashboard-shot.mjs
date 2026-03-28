import { mkdir } from "node:fs/promises"
import path from "node:path"

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3000"
const appPassword = process.env.APP_PASSWORD
const outputDir = path.join(process.cwd(), "artifacts", "screenshots")
const outputPath = path.join(outputDir, "dashboard.png")
const skipNotePath = path.join(outputDir, "dashboard.SKIPPED.txt")

async function writeSkipNote(reason) {
  await mkdir(outputDir, { recursive: true })
  const { writeFile } = await import("node:fs/promises")
  const message = [
    "Dashboard screenshot was skipped.",
    `Reason: ${reason}`,
    `Timestamp: ${new Date().toISOString()}`
  ].join("\n")
  await writeFile(skipNotePath, `${message}\n`, "utf8")
  console.warn(`${message}\nSkip note saved to ${skipNotePath}`)
}

async function run() {
  let chromium

  if (!appPassword) {
    await writeSkipNote("APP_PASSWORD is not set in the environment.")
    return
  }

  try {
    const playwright = await import("playwright")
    chromium = playwright.chromium
  } catch (error) {
    await writeSkipNote("Playwright is not installed in this environment.")
    return
  }

  await mkdir(outputDir, { recursive: true })

  const browser = await chromium.launch({
    headless: true
  })

  try {
    const page = await browser.newPage({
      viewport: {
        width: 1720,
        height: 1080
      }
    })

    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" })
    await page.fill("#password", appPassword)
    await page.click("button[type='submit']")
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 })

    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" })
    await page.waitForSelector(".topNav", { timeout: 20000 })

    await page.screenshot({
      path: outputPath,
      fullPage: true
    })

    console.log(`Dashboard screenshot saved to ${outputPath}`)
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  console.error("Unable to capture dashboard screenshot.", error)
  process.exit(1)
})
