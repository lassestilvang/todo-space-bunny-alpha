import { chromium } from 'playwright'
const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const b = await chromium.launch({ executablePath: CHROME })
const page = await b.newPage({ viewport: { width: 1600, height: 980 }, deviceScaleFactor: 1 })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await page.goto('http://localhost:5180', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

const T = 'Drag-to-resize on the time grid'
const label = async () => page.locator(`[role="button"][aria-label^="${T}"]`).first().getAttribute('aria-label')
console.log('block at rest   :', await label())

await page.locator(`[role="button"][aria-label^="${T}"]`).first().click()
await page.waitForTimeout(500)
console.log('panel estimate  :', JSON.stringify(await page.locator('text=/m left of/').first().innerText().catch(() => 'n/a')))

const steps = page.locator('[role="dialog"] div.group button[role="checkbox"], [role="dialog"] div.group [role="checkbox"]')
const count = await steps.count()
console.log('step checkboxes :', count)
for (let i = 0; i < count; i++) {
  const l = await label()
  await steps.nth(i).click({ force: true })
  await page.waitForTimeout(500)
  console.log(`  after tick ${i + 1}  :`, l, '->', await label())
}
await page.screenshot({ path: '/tmp/subtasks.png' })
console.log('panel estimate  :', JSON.stringify(await page.locator('text=/m left of/').first().innerText().catch(() => 'n/a')))
console.log('errors', errs.length ? errs : 'none')
await b.close()
