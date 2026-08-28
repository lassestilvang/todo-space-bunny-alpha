import { chromium } from 'playwright'
const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`

const browser = await chromium.launch({ executablePath: CHROME })

// Count oscillator graphs without needing to hear anything.
const spy = () => {
  window.__tones = 0
  const AC = window.AudioContext
  const wrap = (name) => {
    const orig = AC.prototype[name]
    AC.prototype[name] = function (...args) {
      window.__tones++
      return orig.apply(this, args)
    }
  }
  wrap('createOscillator')
  wrap('createGain')
}

async function scenario(label, { soundOn, hidden }) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.clock.install()
  await page.addInitScript(spy)
  await page.goto('http://localhost:5180', { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await page.clock.runFor(1200)

  if (soundOn) {
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(300)
    await page.locator('input[placeholder*="earch" i]').fill('settings')
    await page.waitForTimeout(200)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    const box = page.locator('text=/^Sound$/').first()
    if (await box.count()) await box.click().catch(() => {})
    // the toggle is a checkbox inside the Sound row
    const cb = page.locator('input[type="checkbox"]').last()
    if (await cb.isChecked().catch(() => false) !== soundOn) await cb.click({ force: true }).catch(() => {})
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
  const settingOn = await page.evaluate(async () => {
    const raw = JSON.parse(localStorage.getItem('tempo.v1') ?? '{}')
    return raw?.state?.settings?.soundOn ?? null
  })

  if (hidden) {
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true })
    })
  }

  // Enter focus mode, start the shortest possible block, then run past its end.
  await page.keyboard.press('f')
  await page.waitForTimeout(300)
  await page.keyboard.press(' ')
  await page.waitForTimeout(300)
  const before = await page.evaluate(() => window.__tones)
  await page.clock.fastForward('26:00')
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => window.__tones)
  const first = await page.evaluate(() => window.__tones)
  // let the break finish too, so the return to work plays its own cue
  await page.clock.fastForward('05:30')
  await page.waitForTimeout(400)
  const second = await page.evaluate(() => window.__tones)
  const surface = await page.locator('[aria-label="Focus mode"]').innerText().catch(() => '')
  console.log(`   phase 1 -> ${after - before} nodes, phase 2 -> ${second - first} nodes`)
  console.log(
    `${label.padEnd(22)} setting=${settingOn} tones ${before} -> ${after} ${after > before ? 'PLAYED' : 'silent'} | now ${surface.split('\n')[0]} ${surface.split('\n')[2] ?? ''}`,
  )
  if (errors.length) console.log('   errors:', errors)
  await page.close()
}

await scenario('sound off (default)', { soundOn: false })
await scenario('sound on', { soundOn: true })
await scenario('sound on, tab hidden', { soundOn: true, hidden: true })
await browser.close()