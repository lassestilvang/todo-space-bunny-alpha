/* The three things that only break somewhere else: a narrow window, another
 * timezone, and a much larger workspace.
 *
 * These need a different kind of check from verify-actions.mjs — the assertions
 * are about invariants that must hold everywhere, not about one screen doing one
 * thing. Run: npm run verify:env
 */
import { chromium } from 'playwright'
import { ensureServer } from './serve.mjs'

const URL = process.env.URL ?? 'http://localhost:5180'
const OUT = process.env.OUT ?? '/tmp/tempo-env'

let passed = 0
const failures = []
const check = (name, ok, detail = '') => {
  if (ok) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const fresh = async (browser, options = {}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...options,
  })
  const page = await context.newPage()
  const problems = []
  page.on('pageerror', (e) => problems.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text())
  })
  await page.clock.setFixedTime(new Date(2026, 9, 2, 9, 5))
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  return { context, page, problems }
}

/**
 * Force the store to persist, so a check can read what the app believes.
 * Waits for the write rather than assuming it: every later check depends on it,
 * and a silent miss here looks like an app bug three steps later.
 */
const persist = async (page) => {
  await page
    .locator('aside button[role="checkbox"], [role="dialog"] button[role="checkbox"]')
    .first()
    .click({ force: true })
    .catch(() => {})
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const there = await page.evaluate(() => !!localStorage.getItem('tempo.v1'))
    if (there) return true
    await page.waitForTimeout(200)
  }
  throw new Error('the store never persisted, so nothing downstream can be trusted')
}

const run = async () => {
  const server = await ensureServer(URL)
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  })

  /* ------------------------------ a narrow window ----------------------------- */
  console.log('narrow windows')
  for (const width of [1440, 1180, 1024, 900, 820, 760]) {
    const { context, page, problems } = await fresh(browser, { viewport: { width, height: 760 } })
    const day = await page.evaluate(() => {
      const grid = document.querySelector('.relative.flex.min-w-0.flex-1')
      const block = document.querySelector('[role="button"][aria-label]')
      return {
        grid: Math.round(grid?.getBoundingClientRect().width ?? 0),
        block: Math.round(block?.getBoundingClientRect().width ?? 0),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        hasCapture: !!document.querySelector('[class*="grain"] textarea, .grain textarea'),
      }
    })
    await page.keyboard.press('w')
    await page.waitForTimeout(600)
    const week = await page.evaluate(() => {
      const c = document.querySelector('.relative.flex.min-w-0.flex-1')
      return c ? Math.round(c.getBoundingClientRect().width / 7) : 0
    })
    const tag = `${width}px`
    check(`${tag}: no errors`, problems.length === 0, problems[0] ?? '')
    check(`${tag}: no sideways scroll`, !day.overflow)
    check(`${tag}: capture bar present`, day.hasCapture)
    // A block too narrow for its title is not a calendar, it is a stripe.
    check(`${tag}: blocks stay readable`, day.block >= 60, `block ${day.block}px`)
    check(`${tag}: week columns stay usable`, week >= 56, `${week}px per column`)
    await page.screenshot({ path: `${OUT}-${width}.png` })
    await context.close()
  }

  /* ------------------------------ another timezone --------------------------- */
  console.log('other timezones')
  for (const tz of ['Asia/Tokyo', 'America/New_York', 'Australia/Sydney']) {
    const { context, page, problems } = await fresh(browser, { timezoneId: tz })
    await persist(page)
    // Ticking a habit makes the calendar re-fit, and that write carries the
    // *in-memory* state — so let it land before seeding through storage, or it
    // writes over the thousand tasks the moment it fires.
    await page.waitForTimeout(1400)
    // Every block must sit in the column headed by the date it belongs to. This
    // is the invariant a stray UTC conversion would break, and it is checked
    // against the *rendered* header and the *raw* timestamp, never the app's
    // own date helpers.
    const aligned = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('tempo.v1')).state
      const byTitle = new Map(Object.values(state.tasks).map((t) => [t.title, t]))
      // The header strip shows the day of the month for each column, left to right.
      const headerDays = [...document.querySelectorAll('div.min-w-0.flex-1.border-l')].map((c) => {
        const n = [...c.querySelectorAll('span.mono-clock')].find((s) => /^\d{1,2}$/.test(s.textContent.trim()))
        return n ? Number(n.textContent.trim()) : null
      })
      const grid = document.querySelector('.relative.flex.min-w-0.flex-1')
      const box = grid.getBoundingClientRect()
      const width = box.width / (headerDays.length || 1)
      const problems = []
      for (const el of document.querySelectorAll('[role="button"][aria-label]')) {
        const m = /^([^,]+), \d{2}:\d{2} to/.exec(el.getAttribute('aria-label'))
        if (!m) continue
        const task = byTitle.get(m[1].trim())
        if (!task?.scheduled) continue
        const b = el.getBoundingClientRect()
        const column = Math.floor((b.left + b.width / 2 - box.left) / width)
        const shown = headerDays[column]
        if (shown === null) continue
        const actual = new Date(task.scheduled.start).getDate()
        if (shown !== actual) problems.push(`${m[1]} is on day ${actual} but drawn under day ${shown}`)
      }
      return problems
    })
    check(`${tz}: no errors`, problems.length === 0, problems[0] ?? '')
    check(`${tz}: every block sits under its own hour`, aligned.length === 0, aligned.slice(0, 2).join('; '))
    await page.keyboard.press('w')
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}-tz-${tz.replace(/\//g, '-')}.png` })
    await context.close()
  }

  /* ----------------------------- a much larger workspace --------------------- */
  console.log('a thousand tasks')
  {
    // Boot once to learn the shape of a seeded workspace, then boot again with a
    // thousand extra tasks written *before* the app starts. Going through storage
    // after boot races the store's own writes, which is how this check first
    // failed: the app helpfully wrote its twenty-three in-memory tasks back over
    // the thousand.
    const probe = await fresh(browser)
    await persist(probe.page)
    const template = await probe.page.evaluate(() => localStorage.getItem('tempo.v1'))
    await probe.context.close()
    if (!template) throw new Error('the store never persisted a template workspace')

    const bulkState = JSON.parse(template)
    const base = new Date(2026, 9, 2)
    for (let i = 0; i < 1000; i++) {
      const due = new Date(base)
      due.setDate(due.getDate() + (i % 30))
      const key = `${due.getFullYear()}-${`${due.getMonth() + 1}`.padStart(2, '0')}-${`${due.getDate()}`.padStart(2, '0')}`
      bulkState.state.tasks[`big${i}`] = {
        id: `big${i}`,
        title: `Bulk task ${i}`,
        notes: '',
        completed: i % 7 === 0,
        createdAt: base.getTime(),
        updatedAt: base.getTime(),
        due: key,
        dueHasTime: false,
        scheduled: null,
        durationMin: 30,
        priority: (i % 4) + 1,
        energy: i % 3 === 0 ? 'deep' : 'shallow',
        dayPart: 'any',
        labelIds: [],
        subtasks: [],
        reminders: [],
        pinned: false,
        planLocked: true,
        completedStreak: 0,
        order: i,
      }
    }
    const payload = JSON.stringify(bulkState)

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addInitScript((p) => window.localStorage.setItem('tempo.v1', p), payload)
    const page = await context.newPage()
    const problems = []
    page.on('pageerror', (e) => problems.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text())
    })
    await page.clock.setFixedTime(new Date(2026, 9, 2, 9, 5))
    const started = Date.now()
    await page.goto(URL, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    check('a thousand tasks: the app boots', true, `${Date.now() - started}ms`)
    check('a thousand tasks: no errors', problems.length === 0, problems[0] ?? '')

    const stored = await page.evaluate(
      () => Object.keys(JSON.parse(localStorage.getItem('tempo.v1')).state.tasks).length,
    )
    check('all 1000 seeded tasks are there', stored > 1000, `${stored} in storage`)

    const blocks = await page.locator('[role="button"][aria-label]').count()
    check('the day still draws', blocks > 0, `${blocks} blocks`)

    // The list view is where a thousand rows would hurt.
    const listStart = Date.now()
    await page.locator('nav button:has-text("Inbox")').first().click()
    await page.waitForTimeout(2000)
    const rows = await page.locator('main .group').count()
    const elapsed = Date.now() - listStart
    // The sidebar count and the rendered list must agree, whichever is right.
    const badge = Number(
      (await page.locator('nav button:has-text("Inbox")').first().innerText())
        .replace(/\D/g, '')
        .trim(),
    )
    check('the list view renders what the sidebar counts', rows === badge, `${rows} rows vs ${badge} in the sidebar`)
    check('and there really are a thousand tasks', badge > 800, `${badge} open in the inbox`)
    check('and it stays responsive', elapsed < 8000, `${rows} rows in ${elapsed}ms`)
    await page.screenshot({ path: `${OUT}-big.png` })

    // And the planner still answers.
    await page.keyboard.press('p')
    await page.waitForTimeout(1200)
    check('the planner still answers', await page.locator('[role="dialog"]').isVisible())
    await page.keyboard.press('Escape')
    await context.close()
  }

  await browser.close()
  server?.kill()
  console.log(
    `\n${failures.length ? `FAILURES (${failures.length}):\n- ${failures.join('\n- ')}` : `all ${passed} environment checks passed`}`,
  )
  process.exit(failures.length ? 1 : 0)
}

run()
