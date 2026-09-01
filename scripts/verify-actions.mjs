/* Interaction tests: the behaviour that only exists in a browser.
 *
 * The unit tests cover the arithmetic. These cover the parts a jsdom run would
 * have to fake — real layout, real pointer events, real scroll — and each one
 * pins a bug this app actually had:
 *
 *   - a drag displaced by the scroll amount
 *   - a block in an overlap cascade jumping when grabbed
 *   - a drag opening the detail panel on release
 *   - a click failing to open it
 *   - an inline field creating work with no project
 *   - undo not covering a whole refit
 *
 * Needs the app served (defaults to localhost:5180). Run: npm run verify:actions
 */
import { chromium } from 'playwright'

const URL = process.env.URL ?? 'http://localhost:5180'
const OUT = process.env.OUT ?? '/tmp/tempo-actions'
const VIEWPORT = { width: 1600, height: 980 }
/** An hour of grid, at the default 76px scale. */
const HOUR = 76

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

const minutesOf = (label) => {
  const m = /(\d{2}):(\d{2}) to (\d{2}):(\d{2})/.exec(label ?? '')
  if (!m) return null
  return { from: Number(m[1]) * 60 + Number(m[2]), to: Number(m[3]) * 60 + Number(m[4]) }
}

async function withPage(browser, act) {
  const page = await browser.newPage({ viewport: VIEWPORT })
  const problems = []
  page.on('pageerror', (e) => problems.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text())
  })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1100)
  try {
    await act(page)
  } catch (e) {
    failures.push(`threw: ${e.message}`)
  }
  if (problems.length) failures.push(`console: ${[...new Set(problems)].join(' | ')}`)
  await page.close()
}

/** Drag a block by `dy` pixels, grabbing it `grabY` below its top. */
async function dragBlock(page, titlePrefix, dy, grabY = 6) {
  const sel = `[role="button"][aria-label^="${titlePrefix}"]`
  const before = await page.locator(sel).first().getAttribute('aria-label')
  const box = await page.locator(sel).first().boundingBox()
  const x = box.x + Math.min(20, box.width / 3)
  await page.mouse.move(x, box.y + grabY)
  await page.mouse.down()
  await page.mouse.move(x, box.y + grabY + dy, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  return { before, after: await page.locator(sel).first().getAttribute('aria-label') }
}

const run = async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  })

  console.log('dragging')
  await withPage(browser, async (page) => {
    const { before, after } = await dragBlock(page, 'Landing page copy pass', HOUR)
    const b = minutesOf(before)
    const a = minutesOf(after)
    check('a block moves exactly as far as the pointer', a.from - b.from === 60, `${before} -> ${after}`)
  })

  await withPage(browser, async (page) => {
    const { before, after } = await dragBlock(page, 'Landing page copy pass', -HOUR)
    const b = minutesOf(before)
    const a = minutesOf(after)
    check('and upwards too', a.from - b.from === -60, `${before} -> ${after}`)
  })

  await withPage(browser, async (page) => {
    // A block that is already in an overlap cascade.
    const stacked = await page.locator('[role="button"][aria-label^="Standup"]').first().boundingBox()
    const info = await page.locator('[role="button"][aria-label^="Standup"]').first().getAttribute('aria-label')
    const x = stacked.x + Math.min(16, stacked.width / 3)
    // The middle, not the top: the first few pixels of a block are its resize
    // handle, and a fifteen-minute block is barely taller than that.
    const grab = stacked.height / 2
    await page.mouse.move(x, stacked.y + grab)
    await page.mouse.down()
    await page.mouse.move(x, stacked.y + grab + HOUR, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(500)
    const after = await page.locator('[role="button"][aria-label^="Standup"]').first().getAttribute('aria-label')
    const b = minutesOf(info)
    const a = minutesOf(after)
    check(
      'a block in a cascade moves without jumping',
      a.from - b.from === 60,
      `${info} -> ${after}`,
    )
  })

  await withPage(browser, async (page) => {
    // Regression: the pointer was measured against a rect that already carried
    // the scroll, so every drag on a scrolled grid was displaced.
    await page.evaluate(() => {
      const scroller = [...document.querySelectorAll('div')].find(
        (d) => d.scrollHeight > d.clientHeight + 200,
      )
      if (scroller) scroller.scrollTop = 260
    })
    await page.waitForTimeout(400)
    const { before, after } = await dragBlock(page, 'Landing page copy pass', HOUR)
    const b = minutesOf(before)
    const a = minutesOf(after)
    check('a drag on a scrolled grid is not displaced', a.from - b.from === 60, `${before} -> ${after}`)
  })

  console.log('resizing')
  await withPage(browser, async (page) => {
    const sel = '[role="button"][aria-label^="Rewrite the planner"]'
    const before = await page.locator(sel).first().getAttribute('aria-label')
    const box = await page.locator(sel).first().boundingBox()
    await page.mouse.move(box.x + 20, box.y + box.height - 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 20, box.y + box.height - 2 + HOUR, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(500)
    const after = await page.locator(sel).first().getAttribute('aria-label')
    const b = minutesOf(before)
    const a = minutesOf(after)
    check('the bottom edge extends the end', a.to - b.to === 60 && a.from === b.from, `${before} -> ${after}`)
  })

  console.log('across days')
  await withPage(browser, async (page) => {
    await page.keyboard.press('w')
    await page.waitForTimeout(700)
    const sel = '[role="button"][aria-label^="Landing page copy pass"]'
    const box = await page.locator(sel).first().boundingBox()
    const geometry = await page.evaluate(() => {
      const r = document.querySelector('.relative.flex.min-w-0.flex-1').getBoundingClientRect()
      return { left: r.left, width: r.width / 7 }
    })
    const startedInColumn = Math.floor((box.x + 4 - geometry.left) / geometry.width)
    const x = box.x + Math.min(20, box.width / 3)
    await page.mouse.move(x, box.y + 6)
    await page.mouse.down()
    await page.mouse.move(x + geometry.width * 2, box.y + 6, { steps: 14 })
    await page.mouse.up()
    await page.waitForTimeout(600)
    const landed = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('tempo.v1'))
      const t = Object.values(raw.state.tasks).find((x) => x.title === 'Landing page copy pass')
      const d = new Date(t.scheduled.start)
      const key = (x) => `${x.getFullYear()}-${`${x.getMonth() + 1}`.padStart(2, '0')}-${`${x.getDate()}`.padStart(2, '0')}`
      return { day: key(d), time: `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}` }
    })
    // Two columns right of wherever the block started.
    const expected = await page.evaluate((from) => {
      const d = new Date()
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + from + 2)
      const key = (x) => `${x.getFullYear()}-${`${x.getMonth() + 1}`.padStart(2, '0')}-${`${x.getDate()}`.padStart(2, '0')}`
      return key(d)
    }, startedInColumn)
    check(
      'a block lands on the day it was released over',
      landed.day === expected,
      `released over ${expected}, landed on ${landed.day} at ${landed.time}`,
    )
  })

  console.log('the detail panel')
  await withPage(browser, async (page) => {
    await dragBlock(page, 'Landing page copy pass', HOUR)
    await page.waitForTimeout(400)
    check('a drag does not open the editor', (await page.locator('[role="dialog"]').count()) === 0)
  })

  await withPage(browser, async (page) => {
    const sel = '[role="button"][aria-label^="Rewrite the planner"]'
    const box = await page.locator(sel).first().boundingBox()
    await page.mouse.click(box.x + 20, box.y + 8)
    await page.waitForTimeout(500)
    check('a click does open it', (await page.locator('[role="dialog"]').count()) === 1)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    check('Escape closes it', (await page.locator('[role="dialog"]').count()) === 0)
  })

  console.log('drawing a block')
  await withPage(browser, async (page) => {
    await page.evaluate(() => {
      const scroller = [...document.querySelectorAll('div')].find(
        (d) => d.scrollHeight > d.clientHeight + 200,
      )
      if (scroller) scroller.scrollTop = 0
    })
    await page.waitForTimeout(300)
    const spot = await page.evaluate(() => {
      const col = document.querySelector('.relative.flex.min-w-0.flex-1 > div.relative')
      const r = col.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top }
    })
    const y = spot.y + 2 * HOUR
    await page.mouse.move(spot.x, y)
    await page.mouse.down()
    await page.mouse.move(spot.x, y + HOUR, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(500)
    const field = page.locator('input[placeholder*="–"]')
    check('dragging out a range opens the inline field', await field.isVisible())

    await field.fill(`${'08:00'.padStart(5, '0')}–${'09:00'.padStart(5, '0')} Sketch #Studio`)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    const label = await page
      .locator('[role="button"][aria-label^="Sketch"]')
      .first()
      .getAttribute('aria-label')
      .catch(() => null)
    check('and the title lands on the clock', !!label, `label: ${label}`)
    const project = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('tempo.v1'))
      const t = Object.values(raw.state.tasks).find((x) => x.title === 'Sketch')
      return t?.projectId ? raw.state.projects[t.projectId]?.name : null
    })
    check('with the project the field parsed', project === 'Studio', `project: ${project}`)
  })

  console.log('undo')
  await withPage(browser, async (page) => {
    // Drag into empty space so nothing is displaced: then the drag is the only
    // change and one undo has to be enough. (When a drag displaces other work,
    // the calendar re-fitting is a second, separate step by design.)
    // Into free space late in the day, so nothing is displaced and the drag is
    // the only change.
    const sel = '[role="button"][aria-label^="Rewrite the planner"]'
    const before = await page.locator(sel).first().getAttribute('aria-label')
    const box = await page.locator(sel).first().boundingBox()
    const x = box.x + Math.min(20, box.width / 3)
    const grab = box.height / 2
    await page.mouse.move(x, box.y + grab)
    await page.mouse.down()
    await page.mouse.move(x, box.y + grab + 6 * HOUR, { steps: 18 })
    await page.mouse.up()
    await page.waitForTimeout(1100)
    const moved = await page.locator(sel).first().getAttribute('aria-label')
    check('the block actually moved', moved !== before, `${before} -> ${moved}`)
    await page.keyboard.press('Meta+z')
    await page.waitForTimeout(700)
    const after = await page.locator(sel).first().getAttribute('aria-label')
    check('one undo puts a dragged block back', before === after, `${moved} -> ${after}`)
  })

  console.log('the detail panel')
  await withPage(browser, async (page) => {
    // Open a task, retype its title, and commit with Enter.
    const sel = '[role="button"][aria-label^="Landing page copy pass"]'
    await page.locator(sel).first().click()
    await page.waitForTimeout(400)
    const title = page.locator('[role="dialog"] textarea').first()
    await title.fill('Landing page copy, second pass')
    await title.press('Enter')
    await page.waitForTimeout(600)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const renamed = await page.locator('[role="button"][aria-label^="Landing page copy, second pass"]').count()
    check('a retitled task keeps its new name', renamed === 1)

    // And its block is still on the clock, where it was.
    const where = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('tempo.v1'))
      const t = Object.values(raw.state.tasks).find((x) => x.title === 'Landing page copy, second pass')
      return t?.scheduled ? new Date(t.scheduled.start).toTimeString().slice(0, 5) : null
    })
    check('and its block has not moved', where !== null, `start: ${where}`)
  })

  await withPage(browser, async (page) => {
    const sel = '[role="button"][aria-label^="Rewrite the planner"]'
    await page.locator(sel).first().click()
    await page.waitForTimeout(400)
    await page.locator('[role="dialog"] button:has-text("P1")').first().click()
    await page.waitForTimeout(500)
    const p = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('tempo.v1'))
      return Object.values(raw.state.tasks).find((t) => t.title.startsWith('Rewrite'))?.priority
    })
    check('changing priority in the panel persists', p === 1, `priority: ${p}`)
  })

  await withPage(browser, async (page) => {
    // Typing is a live edit, so it must not become a separate undo step either.
    const sel = '[role="button"][aria-label^="Landing page copy pass"]'
    await page.locator(sel).first().click()
    await page.waitForTimeout(400)
    const title = page.locator('[role="dialog"] textarea').first()
    await title.fill('One')
    await title.press('Tab')
    await page.waitForTimeout(400)
    await title.fill('One and a half')
    await title.press('Enter')
    await page.waitForTimeout(600)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const after = await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('tempo.v1'))
      return Object.values(raw.state.tasks).find((t) => t.title.includes('One'))?.title
    })
    check('the last edit wins, not the first keystroke', after === 'One and a half', `title: ${after}`)
  })

  await withPage(browser, async (page) => {
    // Deleting from the panel closes it and removes the work.
    const sel = '[role="button"][aria-label^="Landing page copy pass"]'
    await page.locator(sel).first().click()
    await page.waitForTimeout(400)
    await page.locator('[role="dialog"] button:has-text("Delete")').first().click()
    await page.waitForTimeout(600)
    check('deleting closes the panel', (await page.locator('[role="dialog"]').count()) === 0)
    check('and the block is gone', (await page.locator(sel).count()) === 0)
  })

  await withPage(browser, async (page) => {
    // Keyboard only: open with Enter from the grid, then Escape out.
    const sel = '[role="button"][aria-label^="Rewrite the planner"]'
    await page.locator(sel).first().focus()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    const opened = (await page.locator('[role="dialog"]').count()) === 1
    check('Enter on a focused block opens the editor', opened)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    check('Escape closes it again', (await page.locator('[role="dialog"]').count()) === 0)
    // Arrow keys nudge the focused block.
    const before = await page.locator(sel).first().getAttribute('aria-label')
    await page.locator(sel).first().focus()
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(500)
    const after = await page.locator(sel).first().getAttribute('aria-label')
    const bm = minutesOf(before)
    const am = minutesOf(after)
    check(
      'arrow keys nudge a focused block',
      bm && am && am.from - bm.from === 15,
      `${before} -> ${after}`,
    )
  })

  console.log('the filter editor')
  await withPage(browser, async (page) => {
    await page.locator('nav button[aria-label="New filter"]').click()
    await page.waitForTimeout(400)
    await page.locator('input[placeholder="Deep work this week"]').fill('Not on the clock')
    await page.locator('button:has-text("Add condition")').click()
    await page.waitForTimeout(250)
    await page.locator('[aria-label="Condition"]').first().selectOption('scheduled')
    await page.waitForTimeout(350)
    // The clause starts as "not on the clock"; flipping it to the other value
    // has to change the count.
    const offClock = await page.locator('text=/open tasks? answer this/').innerText()
    await page.locator('select[aria-label="Scheduled"]').selectOption('yes')
    await page.waitForTimeout(400)
    const onClock = await page.locator('text=/open tasks? answer this/').innerText()
    check('the count is live as conditions change', onClock !== offClock, `${offClock} -> ${onClock}`)
    // Back to the filter the name promises.
    await page.locator('select[aria-label="Scheduled"]').selectOption('no')
    await page.waitForTimeout(300)

    await page.locator('button:has-text("Create filter")').click()
    await page.waitForTimeout(700)
    check('the filter appears in the sidebar', await page.locator('nav button:has-text("Not on the clock")').isVisible())
    const shown = await page.locator('body').innerText()
    check('and only unscheduled work answers it', /not scheduled/.test(shown), '')
  })

  await withPage(browser, async (page) => {
    // Delete it again from the editor.
    await page.locator('nav button[aria-label="New filter"]').click()
    await page.waitForTimeout(400)
    await page.locator('input[placeholder="Deep work this week"]').fill('Scratch')
    await page.locator('button:has-text("Create filter")').click()
    await page.waitForTimeout(700)
    check('created', await page.locator('nav button:has-text("Scratch")').isVisible())
    await page.locator('nav [aria-label="Edit Scratch"]').click({ force: true })
    await page.waitForTimeout(400)
    await page.locator('[role="dialog"] button:has-text("Delete")').first().click()
    await page.waitForTimeout(600)
    check('and deleted from the editor', (await page.locator('nav button:has-text("Scratch")').count()) === 0)
  })

  console.log('the keyboard')
  await withPage(browser, async (page) => {
    await page.keyboard.press('f')
    await page.waitForTimeout(400)
    const surface = page.locator('[aria-label="Focus mode"]')
    check('F enters focus mode', await surface.isVisible())
    await page.keyboard.press('Space')
    await page.waitForTimeout(1200)
    const title = await page.title()
    check('Space runs the session', /\d\d:\d\d · Focus/.test(title), `title: ${title}`)
    await page.screenshot({ path: `${OUT}-focus.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    check('Escape leaves it, still running', (await page.locator('[aria-label="Focus mode"]').count()) === 0)
    const pill = await page.locator('button[aria-label*="timer" i]').first().innerText()
    check('the pill kept counting', /\d\d:\d\d/.test(pill), `pill: ${pill.replace(/\n/g, ' ')}`)
  })

  await browser.close()
  console.log(
    `\n${failures.length ? `FAILURES (${failures.length}):\n- ${failures.join('\n- ')}` : `all ${passed} interaction checks passed`}`,
  )
  process.exit(failures.length ? 1 : 0)
}

run()