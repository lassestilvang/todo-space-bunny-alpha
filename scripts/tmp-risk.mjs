import { chromium } from 'playwright'
const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const b = await chromium.launch({ executablePath: CHROME })
const page = await b.newPage({ viewport: { width: 1600, height: 980 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await page.goto('http://localhost:5180', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

const today = await page.evaluate(() => new Date().toISOString().slice(0, 10))
const body = async () => (await page.locator('body').innerText()).split('\n')
const railLine = async () => (await body()).find((l) => /after the due date|no time yet/.test(l)) ?? null
const todayCount = async () => {
  const row = page.locator('button').filter({ hasText: /^Today/ }).first()
  return (await row.innerText().catch(() => '')).split('\n').pop()
}

// 1. The seed already has floating work due today: that is "unplaced" risk.
console.log('1 rail line (seed)   :', JSON.stringify(await railLine()))
console.log('1 sidebar Today count:', JSON.stringify(await todayCount()))
console.log('1 grid flags         :', await page.locator('span.text-warn svg').count())

// 2. Make a block genuinely late through the real UI: pull a due date back.
console.log('   blocks on the grid:', JSON.stringify(await page.locator('[role="button"][aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))))
const victim = page.locator('[role="button"][aria-label]').filter({ hasText: '' }).first()
const pick = page.locator('[role="button"][aria-label*="to"]').nth(1)
await pick.click()
await page.waitForTimeout(400)
const due = page.locator('input[type="date"]').first()
await due.fill(today)
await page.waitForTimeout(900)
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
console.log('2 rail line (1 late)  :', JSON.stringify(await railLine()))
console.log('2 sidebar Today count :', JSON.stringify(await todayCount()))
const flagged = await page.locator('[role="button"][aria-label] span.text-warn').evaluateAll((els) =>
  els.map((e) => e.parentElement.getAttribute('aria-label')),
)
console.log('2 flagged blocks      :', JSON.stringify(flagged))
const flagTitle = await page.locator('span.text-warn[title]').first().getAttribute('title').catch(() => null)
console.log('2 flag tooltip        :', JSON.stringify(flagTitle))

// 3. Week view shows the same rule.
await page.keyboard.press('w')
await page.waitForTimeout(700)
console.log('3 week grid flags     :', await page.locator('span.text-warn svg').count())

// 4. List view marks the row.
await page.locator('button').filter({ hasText: /^Today/ }).first().click()
await page.waitForTimeout(600)
const listFlagged = await page.locator('span.text-warn[title]').evaluateAll((els) =>
  els.map((e) => e.getAttribute('title')),
)
console.log('4 list flags          :', JSON.stringify(listFlagged))
await page.screenshot({ path: '/tmp/risk.png' })
console.log('errors', errs.length ? errs : 'none')
await b.close()
