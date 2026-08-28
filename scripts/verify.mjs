/* Visual + runtime smoke test. Not part of the app bundle. */
import { chromium } from 'playwright'

const URL = process.env.URL ?? 'http://localhost:5180'
const OUT = process.env.OUT ?? '/tmp/tempo'

const shots = [
  { name: '01-day', act: async () => {} },
  {
    name: '02-week',
    act: async (page) => {
      await page.keyboard.press('w')
      await page.waitForTimeout(500)
    },
  },
  {
    name: '03-month',
    act: async (page) => {
      await page.keyboard.press('m')
      await page.waitForTimeout(500)
    },
  },
  {
    name: '04-agenda',
    act: async (page) => {
      await page.keyboard.press('a')
      await page.waitForTimeout(400)
    },
  },
  {
    name: '05-plan',
    act: async (page) => {
      await page.keyboard.press('t')
      await page.waitForTimeout(300)
      await page.keyboard.press('p')
      await page.waitForTimeout(600)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    },
  },
  {
    name: '06-capture',
    act: async (page) => {
      await page.keyboard.press('c')
      await page.waitForTimeout(200)
      await page.keyboard.type('Renew the parking permit tomorrow at 9:30 for 20m #Life !2', {
        delay: 8,
      })
      await page.waitForTimeout(500)
    },
  },
  {
    name: '07-matrix',
    act: async (page) => {
      await page.keyboard.press('Escape')
      await page.click('nav button[title="Matrix"], nav button:has-text("Matrix")').catch(() => {})
      await page.waitForTimeout(500)
    },
  },
  {
    name: '08-habits',
    act: async (page) => {
      await page.click('nav button:has-text("Habits")').catch(() => {})
      await page.waitForTimeout(500)
    },
  },
  {
    name: '09-stats',
    act: async (page) => {
      await page.click('nav button:has-text("Review")').catch(() => {})
      await page.waitForTimeout(600)
    },
  },
  {
    name: '09b-focus',
    act: async (page) => {
      await page.click('nav button:has-text("Focus")').catch(() => {})
      await page.waitForTimeout(600)
    },
  },
  {
    name: '10-docs',
    act: async (page) => {
      await page.click('nav button:has-text("Notes")').catch(() => {})
      await page.waitForTimeout(500)
    },
  },
  {
    name: '11-kanban',
    act: async (page) => {
      await page.click('nav button:has-text("Board")').catch(() => {})
      await page.waitForTimeout(500)
    },
  },
  {
    name: '12-inbox',
    act: async (page) => {
      await page.click('nav button:has-text("Inbox")').catch(() => {})
      await page.waitForTimeout(500)
    },
  },
  {
    name: '13-assistant',
    act: async (page) => {
      await page.keyboard.press('1')
      await page.waitForTimeout(300)
      await page.keyboard.press('?')
      await page.waitForTimeout(500)
      await page.keyboard.press('Escape')
      await page.click('nav button[aria-label="Toggle assistant"], header button[aria-label="Toggle assistant"]').catch(() => {})
      await page.waitForTimeout(300)
      await page.click('button:has-text("Plan my day")').catch(() => {})
      await page.waitForTimeout(900)
    },
  },
  {
    name: '14-light',
    act: async (page) => {
      await page.keyboard.press('Escape')
      await page.keyboard.press('s')
      await page.waitForTimeout(600)
    },
  },
]

const run = async () => {
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ??
      `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  })
  const page = await browser.newPage({ viewport: { width: 1600, height: 980 }, deviceScaleFactor: 2 })
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  for (const s of shots) {
    try {
      await s.act(page)
      await page.screenshot({ path: `${OUT}-${s.name}.png` })
    } catch (e) {
      errors.push(`[shot ${s.name}] ${e.message}`)
    }
  }

  console.log(errors.length ? 'ISSUES:\n' + [...new Set(errors)].join('\n') : 'clean: no console errors')
  await browser.close()
}

run()
