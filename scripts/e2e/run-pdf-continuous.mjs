import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const fixture = process.env.SHIYUN_PDF_FIXTURE
if (!fixture) throw new Error('Set SHIYUN_PDF_FIXTURE to a PDF with at least four pages')
const dataDir = await mkdtemp(join(tmpdir(), 'shiyun-desktop-validation-'))
const port = '9338'
const electron = resolve('node_modules/electron/dist/electron.exe')
const env = {
  ...process.env,
  ELECTRON_RUN_AS_NODE: undefined,
  SHIYUN_DATA_DIR: dataDir,
  SHIYUN_PDF_FIXTURE: fixture,
  SHIYUN_CDP_PORT: port,
}
const desktop = spawn(electron, ['.', `--remote-debugging-port=${port}`], {
  cwd: process.cwd(),
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
let stderr = ''
desktop.stderr.on('data', (chunk) => { stderr += chunk.toString() })

const waitUntilReady = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`)
      if (response.ok) return
    } catch {
      // Electron has not opened the debugging port yet.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200))
  }
  throw new Error(`Electron did not become ready. ${stderr}`)
}

try {
  await waitUntilReady()
  const smoke = spawn(process.execPath, ['scripts/e2e/pdf-continuous-smoke.mjs'], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  })
  const code = await new Promise((resolvePromise) => smoke.once('exit', resolvePromise))
  if (code !== 0) throw new Error(`PDF continuous smoke failed with exit code ${code}`)
  console.log(`VALIDATION_DIR=${dataDir}`)
} finally {
  desktop.kill()
}
