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

const block = async (title) => page.locator(`[role="button"][aria-label^="${title}"]`).first().getAttribute('aria-label')
const openTask = async (title) => {
  await page.locator('[role="button"][aria-label^="Outline the launch essay"]').first().click().catch(() => {})
  await page.waitForTimeout(400)
}
console.log('seed blocks:', JSON.stringify(await block('Outline the launch essay')), JSON.stringify(await block('Draft the onboarding')))

// Give the seeded task three steps by ticking them through the panel.
await page.locator('button[aria-label*="Outline the launch essay"], [role="button"][aria-label^="Outline the launch essay"]').first().click()
await page.waitForTimeout(500)
const rows = await page.locator('input[placeholder*="step" i], input[placeholder*="Add" i]').count()
console.log('step inputs in panel:', rows)

// Use the store through the panel's own checkbox to tick the first two steps.
const boxes = page.locator('[role="dialog"] button[role="checkbox"], [role="dialog"] input[type="checkbox"]')
const n = await boxes.count()
console.log('checkboxes in panel:', n)
// the habit boxes are first; the step boxes follow
for (let i = 0; i < Math.min(2, n); i++) {
  await boxes.nth(i).click({ force: true }).catch(() => {})
  await page.waitForTimeout(350)
}
const doneSubs = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('tempo.v1'))
  const t = Object.values(raw.state.tasks).find((x) => x.title.startsWith('Outline the launch'))
  return { subs: t?.subtasks?.length, done: t?.subtasks?.filter((s) => s.done).length, dur: t?.durationMin }
})
console.log('steps ticked:', JSON.stringify(doneSubs))
console.log('block now     :', JSON.stringify(await block('Outline the launch essay').catch(() => 'gone')))
await page.screenshot({ path: '/tmp/subtasks.png' })
console.log('errors', errs.length ? errs : 'none')
await b.close()