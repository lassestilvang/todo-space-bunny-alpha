/* Makes sure there is something to test against. Not part of the app bundle. */
import { spawn } from 'node:child_process'

const alive = async (url, timeoutMs = 1200) => {
  try {
    const ctl = AbortSignal.timeout(timeoutMs)
    const res = await fetch(url, { signal: ctl })
    return res.ok || res.status < 500
  } catch {
    return false
  }
}

/**
 * Use the app at `url`, starting a dev server if nothing is already serving it.
 * Returns the child process, so the caller can stop it again.
 */
export async function ensureServer(url = 'http://localhost:5180') {
  if (await alive(url)) return null

  const port = new URL(url).port || '5173'
  const child = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', '--port', port, '--strictPort'],
    { stdio: 'ignore', detached: false },
  )

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (await alive(url)) return child
    await new Promise((r) => setTimeout(r, 400))
  }
  child.kill()
  throw new Error(`No app at ${url}, and starting one on port ${port} did not work.`)
}
