import { chromium } from 'playwright'
const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const browser = await chromium.launch({ executablePath: CHROME })
const page = await browser.newPage({ viewport: { width: 1600, height: 980 }, deviceScaleFactor: 1 })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await page.goto('http://localhost:5180', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
// force a persist so the pure-function checks read the app's real data
await page.locator('aside button[role="checkbox"]').first().click({ force: true }).catch(() => {})
await page.waitForTimeout(500)
console.log('browser now:', await page.evaluate(() => new Date().toString()))

const strip = async () => page.locator('header button[title*="—"]').evaluateAll((els) =>
  els.map((e) => ({ t: e.getAttribute('title'), chip: e.innerText.replace(/\n/g, ' ') })),
)
console.log('strip at 10:00ish:')
for (const c of await strip()) console.log('  ', JSON.stringify(c))
await page.screenshot({ path: '/tmp/advise.png' })

// The three triggers, scored on the app's own data.
console.log('\n' + (await page.evaluate(async () => {
  const { adviseNow } = await import('/src/lib/advise.ts')
  const raw = JSON.parse(localStorage.getItem('tempo.v1')).state
  const { tasks, settings } = raw
  const rank = (now, ts = tasks) =>
    adviseNow(Object.values(ts), settings, now, 3)
      .map((a) => `${a.task.title.slice(0, 26)} [${Math.round(a.score)}] ${a.why}`)
  const at = (h, m = 0) => new Date(2026, 9, 1, h, m).getTime()
  const out = []

  out.push('10:00 — ' + rank(at(10, 0)).join(' | '))
  out.push('13:30 — ' + rank(at(13, 30)).join(' | '))
  out.push('15:40 — ' + rank(at(15, 40)).join(' | '))

  // Priority: promote the afternoon block and see it overtake the morning one.
  const rewrite = Object.values(tasks).find((t) => t.title.startsWith('Rewrite'))
  const promote = { ...tasks, [rewrite.id]: { ...rewrite, priority: 1 } }
  out.push('13:30, afternoon task promoted to P1 — ' + rank(at(13, 30), promote).join(' | '))
  return out.join('\n')
})))

// A meeting grows, the refit moves a block, the advice follows.
const before = await strip()
const dr = page.locator('[role="button"][aria-label^="Design review"]').first()
const box = await dr.boundingBox()
await page.mouse.move(box.x + 20, box.y + box.height - 2)
await page.mouse.down()
await page.mouse.move(box.x + 20, box.y + box.height - 2 + 4 * 76, { steps: 16 })
await page.mouse.up()
await page.waitForTimeout(1500)
const after = await strip()
console.log('\nafter growing a meeting:')
console.log('  before:', JSON.stringify(before.map((c) => c.chip)))
console.log('  after :', JSON.stringify(after.map((c) => c.chip)))
console.log('  changed:', JSON.stringify(before) !== JSON.stringify(after))
console.log('\nerrors', errs.length ? errs : 'none')
await browser.close()