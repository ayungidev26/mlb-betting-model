import { mkdir } from "node:fs/promises"
import path from "node:path"

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3000"
const appPassword = process.env.APP_PASSWORD
const outputDir = path.join(process.cwd(), "artifacts", "screenshots")
const outputPath = path.join(outputDir, "dashboard.png")

if (!appPassword) {
  console.error("Missing APP_PASSWORD. Set APP_PASSWORD in your environment before running this script.")
  process.exit(1)
}

async function run() {
  await mkdir(outputDir, { recursive: true })

  let chromium

  try {
    const playwright = await import("playwright")
    chromium = playwright.chromium
  } catch (error) {
    console.error("Playwright is not installed. Run `npm install -D playwright` before using screenshot:dashboard.")
    process.exit(1)
  }

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
