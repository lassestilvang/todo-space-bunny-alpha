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

/**
 * Boot with a workspace of our own making.
 *
 * The app is booted once to learn the shape of its sample, the state is changed,
 * and a second page boots with that state written *before* the app starts.
 * Seeding after boot races the store's own writes, which is how this check first
 * failed: the app helpfully wrote its twenty-three in-memory tasks back over the
 * thousand we had just put in storage.
 */
async function bootWith(browser, mutate, options = {}) {
  const probe = await fresh(browser)
  await persist(probe.page)
  const template = await probe.page.evaluate(() => localStorage.getItem('tempo.v1'))
  await probe.context.close()
  if (!template) throw new Error('the store never persisted, so there is no shape to copy')

  const state = JSON.parse(template)
  mutate(state.state, state)
  const payload = JSON.stringify(state)

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options })
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
  return { context, page, problems, boot: Date.now() - started }
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
    const { context, page, problems, boot } = await bootWith(browser, (state) => {
      const base = new Date(2026, 9, 2)
      for (let i = 0; i < 1000; i++) {
        const due = new Date(base)
        due.setDate(due.getDate() + (i % 30))
        const key = `${due.getFullYear()}-${`${due.getMonth() + 1}`.padStart(2, '0')}-${`${due.getDate()}`.padStart(2, '0')}`
        state.tasks[`big${i}`] = {
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
    })
    await page.waitForTimeout(1200)
    check('a thousand tasks: the app boots', boot < 8000, `${boot}ms`)
    check('a thousand tasks: no errors', problems.length === 0, problems[0] ?? '')

    const stored = await page.evaluate(
      () => Object.keys(JSON.parse(localStorage.getItem('tempo.v1')).state.tasks).length,
    )
    check('all 1000 seeded tasks are there', stored > 1000, `${stored} in storage`)
    check('the day still draws', (await page.locator('[role="button"][aria-label]').count()) > 0)

    const listStart = Date.now()
    await page.locator('nav button:has-text("Inbox")').first().click()
    await page.waitForTimeout(2000)
    const rows = await page.locator('main .group').count()
    const elapsed = Date.now() - listStart
    // The sidebar count and the rendered list must agree, whichever is right.
    const badge = Number(
      (await page.locator('nav button:has-text("Inbox")').first().innerText()).replace(/\D/g, '').trim(),
    )
    check('the list view renders what the sidebar counts', rows === badge, `${rows} rows vs ${badge} counted`)
    check('and there really are a thousand tasks', badge > 800, `${badge} open in the inbox`)
    check('and it stays responsive', elapsed < 8000, `${rows} rows in ${elapsed}ms`)
    await page.screenshot({ path: `${OUT}-big.png` })
    await context.close()
  }

  /* ------------------------------ five hundred filters ------------------------ */
  console.log('three hundred saved filters')
  {
    const { context, page, problems, boot } = await bootWith(browser, (state) => {
      for (let i = 0; i < 300; i++) {
        state.filters[`f${i}`] = {
          id: `f${i}`,
          name: `Filter ${i}`,
          clauses: [{ kind: 'priority', priority: (i % 4) + 1 }],
          order: i,
        }
      }
    })
    await page.waitForTimeout(1000)
    check('three hundred filters: no errors', problems.length === 0, problems[0] ?? '')
    check('three hundred filters: the app boots', boot < 10000, `${boot}ms`)

    // The sidebar shows a handful and offers the rest, so a long list of filters
    // cannot push projects and labels off the screen.
    const listed = await page.locator('nav button[aria-label^="Edit Filter"]').count()
    const more = await page.locator('nav button:has-text("more filter")').innerText().catch(() => '')
    check('the sidebar caps the list', listed === 10, `${listed} rows listed`)
    check('and offers the rest', /^290 more filters$/.test(more.trim()), JSON.stringify(more))
    await page.locator('nav button:has-text("more filter")').click()
    await page.waitForTimeout(400)
    const all = await page.locator('nav button[aria-label^="Edit Filter"]').count()
    check('expanding shows every one', all === 300, `${all} listed`)
    const collapsed = await page.locator('nav button:has-text("Show fewer")').count()
    check('and it collapses again', collapsed === 1)

    // Every sidebar count is recomputed on every change: a filter count times a
    // task count, so this is the first thing to notice a slow workspace. Ticking
    // a habit would not move any task count, so complete a task instead and time
    // how long the numbers take to catch up.
    await page.locator('nav button:has-text("Today")').first().click()
    await page.waitForTimeout(1200)
    // Watch the inbox count: it is derived from the tasks directly, unlike Today,
    // whose badge deliberately shows the at-risk number when there is any risk.
    const countOf = async (label) =>
      Number((await page.locator(`nav button:has-text("${label}")`).first().innerText()).replace(/\D/g, ''))
    const before = await countOf('Inbox')
    const t0 = Date.now()
    await page.locator('main button[role="checkbox"]').first().click({ force: true })
    const moved = await page
      .waitForFunction(
        (was) => {
          const row = [...document.querySelectorAll('nav button')].find((b) =>
            b.textContent.startsWith('Inbox'),
          )
          return row && row.textContent.replace(/\D/g, '') !== was
        },
        before,
        { timeout: 30000 },
      )
      .then(() => true)
      .catch(() => false)
    const settled = Date.now() - t0
    check('a change still settles quickly with them', moved && settled < 4000, `${settled}ms (moved: ${moved})`)
    await page.screenshot({ path: `${OUT}-filters.png` })
    await context.close()
  }

  /* ------------------ a workspace of events and habits, not tasks ------------- */
  console.log('four hundred events and habits')
  {
    const { context, page, problems, boot } = await bootWith(browser, (state) => {
      const at = (dayOffset, hour, half) => {
        const d = new Date(2026, 9, 2 + dayOffset)
        return d.setHours(hour, half, 0, 0)
      }
      for (let i = 0; i < 200; i++) {
        state.events[`busy${i}`] = {
          id: `busy${i}`,
          title: `Busy ${i}`,
          start: at(i % 14, 7 + (i % 9), (i % 2) * 30),
          end: at(i % 14, 7 + (i % 9), (i % 2) * 30) + 1800000,
          allDay: false,
          locked: true,
          tentative: false,
        }
      }
      for (let i = 0; i < 200; i++) {
        state.habits[`h${i}`] = {
          id: `h${i}`,
          name: `Habit ${i}`,
          color: 'c-sky',
          cadence: 'weekdays',
          weekdays: [],
          targetPerWeek: 5,
          anchorMin: 6 * 60 + (i % 12) * 15,
          durationMin: 15,
          log: [],
          archived: false,
          createdAt: at(0, 8, 0),
        }
      }
    })
    await page.waitForTimeout(1200)
    check('many events: no errors', problems.length === 0, problems[0] ?? '')
    check('many events: the app boots', boot < 10000, `${boot}ms`)
    const drawn = await page.locator('[role="button"][aria-label]').count()
    check('the crowded day still draws', drawn > 5, `${drawn} blocks`)

    const planStart = Date.now()
    await page.keyboard.press('p')
    const opened = await page
      .waitForSelector('[role="dialog"]', { timeout: 30000 })
      .then(() => true)
      .catch(() => false)
    const planned = Date.now() - planStart
    check('the planner answers in a crowded day', opened, `${planned}ms`)
    check('and answers promptly', opened && planned < 8000, `${planned}ms`)
    await page.screenshot({ path: `${OUT}-crowded.png` })
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
