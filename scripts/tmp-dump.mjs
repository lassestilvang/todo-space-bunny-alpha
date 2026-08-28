import { chromium } from 'playwright'
const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const b = await chromium.launch({ executablePath: CHROME })
const page = await b.newPage({ viewport: { width: 1600, height: 980 } })
await page.goto('http://localhost:5180', { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.locator('aside button[role="checkbox"]').first().click({ force: true }).catch(() => {})
await page.waitForTimeout(400)
console.log(await page.evaluate(async () => {
  const { adviseNow } = await import('/src/lib/advise.ts')
  const st = JSON.parse(localStorage.getItem('tempo.v1')).state
  const now = Date.now()
  const d = new Date(now)
  const out = ['now = ' + d.toString(), 'blocks:']
  for (const t of Object.values(st.tasks)) {
    if (!t.scheduled) continue
    const s = new Date(t.scheduled.start)
    const e = new Date(t.scheduled.end)
    out.push(`  ${t.title.slice(0, 30).padEnd(30)} ${s.toDateString().slice(0, 11)} ${s.toTimeString().slice(0, 5)}-${e.toTimeString().slice(0, 5)} pri=${t.priority} lock=${t.planLocked} due=${t.due}`)
  }
  out.push('advise(now) -> ' + adviseNow(Object.values(st.tasks), st.settings, now, 3).map((a) => `${a.task.title} [${Math.round(a.score)}]`).join(' | '))
  out.push('workStart/End = ' + st.settings.workStart + '/' + st.settings.workEnd)
  return out.join('\n')
}))
await b.close()
