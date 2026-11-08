/**
 * Live verification for the running 「哨兵 / Sentinel」 bundle.
 *
 * Prerequisite: the bundle is installed and its live config has `debug: true`
 * (dev script: `node tools/dev-install.mjs --debug`), so the Host writes
 * `$DSH_HOME/approval-notifier/status.json`.
 *
 * It checks: pending snapshot (brand/settings/configRevision), the upload /
 * list / serve asset routes, the acknowledgement diagnostics, and that the
 * browser half polls and has registered the Plugins-page configuration form
 * (`page=1` in the client diagnostic).
 *
 * Usage: node verify-live.mjs [--port 63295] [--status-file <path>]
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const results = []
let failures = 0

function parseArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1 || process.argv[index + 1] === undefined) return fallback
  return process.argv[index + 1]
}

function defaultStatusFile() {
  const home = (process.env.DSH_HOME ?? '').trim().length > 0 ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh')
  return join(home, 'approval-notifier', 'status.json')
}

const PORT = Number(parseArg('port', '63295'))
const BASE = `http://127.0.0.1:${String(PORT)}/dsh-approval-notifier`
const STATUS_FILE = parseArg('status-file', defaultStatusFile())

function check(condition, label, detail) {
  results.push({ ok: condition === true, label, ...detail === undefined ? {} : { detail } })
  if (condition === true) return
  failures += 1
  process.stderr.write(`FAIL: ${label}${detail === undefined ? '' : ` — ${String(detail)}`}\n`)
}

async function getJson(path) {
  const response = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: response.status, body }
}

async function postJson(path, payload) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: response.status, body }
}

function readStatus() {
  return JSON.parse(readFileSync(STATUS_FILE, 'utf8'))
}

async function main() {
  check(existsSync(STATUS_FILE), 'debug status file exists (install with debug: true)', STATUS_FILE)
  if (!existsSync(STATUS_FILE)) {
    process.stdout.write(`${JSON.stringify({ ok: false, failures, results }, undefined, 2)}\n`)
    process.exitCode = 1
    return
  }
  const initial = readStatus()
  check(initial.plugin === 'dsh-approval-notifier', 'status plugin id')
  check(initial.version === '2.0.0', 'status version is 2.0.0', initial.version)
  check(initial.brand === '哨兵', 'status brand 哨兵', initial.brand)
  check(initial.debug === true, 'status debug enabled')
  check(initial.routes?.pending === '/dsh-approval-notifier/pending', 'status route table', initial.routes)

  const pending = await getJson('/pending')
  check(pending.status === 200, 'GET /pending answers 200', pending.status)
  check(pending.body?.brand === '哨兵', 'pending brand', pending.body?.brand)
  check(pending.body?.settings?.escalation?.intervalMs === 30000, 'pending escalation interval 30s', pending.body?.settings?.escalation)
  check(pending.body?.settings?.secondReminder?.idleMs === 10000, 'pending second-reminder idle 10s', pending.body?.settings?.secondReminder)
  check(typeof pending.body?.configRevision === 'string' && pending.body.configRevision.length === 12, 'pending config revision', pending.body?.configRevision)
  check(Array.isArray(pending.body?.pending), 'pending list present')

  // Asset upload / list / serve / cleanup.
  const upload = await postJson('/assets', { name: 'sentinel-verify.png', mime: 'image/png', dataBase64: TINY_PNG_BASE64 })
  check(upload.status === 200 && upload.body?.ok === true, 'POST /assets uploads a local image', upload.body)
  const asset = upload.body?.asset
  check(typeof asset?.id === 'string' && /^[a-f0-9]{12}$/u.test(asset.id), 'asset id hashed', asset?.id)
  if (typeof asset?.id === 'string') {
    const response = await fetch(`${BASE}/asset/${asset.id}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    check(response.status === 200, 'GET /asset answers 200', response.status)
    check(response.headers.get('content-type') === 'image/png', 'asset content-type', response.headers.get('content-type'))
    check(bytes.length > 0 && bytes[0] === 0x89, 'asset bytes match the upload', bytes.length)
    const list = await getJson('/assets')
    check(Array.isArray(list.body?.assets) && list.body.assets.some((entry) => entry.id === asset.id), 'GET /assets lists the upload')
    let assetsDir = typeof initial.assetsDir === 'string' ? initial.assetsDir : undefined
    if (assetsDir === undefined) {
      // Older debug builds do not report the path; the status file lives in the
      // same $DSH_HOME/approval-notifier directory as the assets folder.
      assetsDir = join(STATUS_FILE, '..', '..', 'approval-notifier', 'assets')
    }
    if (existsSync(assetsDir)) {
      if (existsSync(join(assetsDir, asset.id))) rmSync(join(assetsDir, asset.id), { force: true })
      const indexPath = join(assetsDir, 'index.json')
      if (existsSync(indexPath)) {
        try {
          const index = JSON.parse(readFileSync(indexPath, 'utf8'))
          index.assets = Array.isArray(index.assets) ? index.assets.filter((entry) => entry.id !== asset.id) : []
          writeFileSync(indexPath, `${JSON.stringify(index, undefined, 2)}\n`, 'utf8')
        } catch {}
      }
    }
  }

  // Ack diagnostics round-trip.
  const ack = await postJson('/ack', { ids: ['selftest-live'], via: 'opened;selftest=1' })
  check(ack.status === 200 && ack.body?.ok === true, 'POST /ack answers ok', ack.body)
  await new Promise((resolve) => setTimeout(resolve, 500))
  const afterAck = readStatus()
  check(afterAck.recent?.some((event) => event.type === 'client/ack'), 'status records client ack')
  check(afterAck.recent?.some((event) => event.type === 'client/opened'), 'status records opened action')

  // Browser half running + Plugins page configuration form registered.
  await new Promise((resolve) => setTimeout(resolve, 3200))
  const afterPoll = readStatus()
  check(afterPoll.stats?.clientPolls > 0, 'browser half polls the host', afterPoll.stats?.clientPolls)
  const diag = String(afterPoll.stats?.lastClientDiag ?? '')
  check(diag.includes('page=1'), 'Plugins configuration page is registered in the browser', diag)
  check(diag.includes(`cfg=${String(pending.body?.configRevision ?? '').slice(0, 16)}`), 'browser half applied the live config revision', diag)

  // V4 layout verification: frame bounds, bottom anchoring, >10 folding,
  // auto-compression and "one event = one reminder".
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const waitDiag = async (predicate, timeoutMs = 24000) => {
    const started = Date.now()
    let snapshot = readStatus()
    let diag = String(snapshot.stats?.lastClientDiag ?? '')
    while (Date.now() - started < timeoutMs) {
      if (predicate(diag)) return { diag, snapshot }
      await sleep(400)
      snapshot = readStatus()
      diag = String(snapshot.stats?.lastClientDiag ?? '')
    }
    return { diag, snapshot }
  }
  const parseFrame = (diag) => {
    const match = /frame=(\d+),(\d+),(\d+);cw=(\d+);mode=([\w-]+);items=(\d+);normal=(\d+);folded=(\d+);compact=(\d+);expanded=(\d+);inside=(\d+);bounds=(-?\d+),(-?\d+);compress=([\d.]+);hl=(\d+)/u.exec(diag)
    if (match === null) return undefined
    return {
      top: Number(match[1]), bottom: Number(match[2]), right: Number(match[3]), cardWidth: Number(match[4]),
      mode: match[5], items: Number(match[6]), normal: Number(match[7]), folded: Number(match[8]),
      compact: Number(match[9]), expanded: Number(match[10]), inside: Number(match[11]),
      boundsTop: Number(match[12]), boundsBottom: Number(match[13]), compress: Number(match[14]), highlight: Number(match[15]),
    }
  }
  await postJson('/debug/clear', {})
  await sleep(600)
  for (let batch = 0; batch < 3; batch += 1) {
    const injected = await postJson('/debug/pending', { count: 4, kind: 'approval', reason: `紧凑模式验证 ${String(batch + 1)}/3` })
    check(injected.status === 200 && injected.body?.ok === true, `POST /debug/pending batch ${String(batch + 1)}`, injected.body)
    await sleep(120)
  }
  const compactState = await waitDiag((diag) => /mode=compact/u.test(diag) && /items=12/u.test(diag))
  const compactFrame = parseFrame(compactState.diag)
  check(compactFrame !== undefined, 'V4 layout diagnostic is parseable', compactState.diag)
  if (compactFrame !== undefined) {
    check(compactFrame.mode === 'compact', 'too many reminders switch every card to the compact yellow bar', compactState.diag)
    check(compactFrame.items === 12, 'all reminders stay visible in compact mode', compactState.diag)
    check(compactFrame.folded === 0, 'folding mode is removed', compactState.diag)
    check(compactFrame.compact >= 11, 'compact bars show the simplified content', compactState.diag)
    check(compactFrame.inside === 1, 'all compact cards stay inside the frame', compactState.diag)
    check(compactFrame.boundsBottom <= compactFrame.bottom + 2, 'cards collapse downward to the frame bottom', `${String(compactFrame.boundsBottom)} <= ${String(compactFrame.bottom)}`)
    check(compactFrame.boundsTop >= compactFrame.top - 2, 'cards do not exceed the frame top', `${String(compactFrame.boundsTop)} >= ${String(compactFrame.top)}`)
    check(compactFrame.highlight === 0, 'no native allow button → no highlight overlay', String(compactFrame.highlight))
  }
  await postJson('/debug/clear', {})
  await sleep(1200)
  for (let batch = 0; batch < 2; batch += 1) {
    await postJson('/debug/pending', { count: 2, kind: 'approval', reason: `压缩验证 ${String(batch + 1)}/2` })
    await sleep(120)
  }
  const compressState = await waitDiag((diag) => /normal=4/u.test(diag), 16000)
  const compressFrame = parseFrame(compressState.diag)
  check(compressFrame !== undefined, 'compression diagnostic is parseable', compressState.diag)
  if (compressFrame !== undefined) {
    check(compressFrame.mode === 'full' || compressFrame.mode === 'full-shrunk', 'four reminders keep the full-text layout', compressState.diag)
    check(compressFrame.items === 4, 'four reminders render as four cards', compressState.diag)
    check(compressFrame.folded === 0, 'four reminders do not use folding', compressState.diag)
    check(compressFrame.compress <= 1, 'four reminders are not stretched', compressState.diag)
    check(compressFrame.inside === 1, 'cards stay inside the frame', compressState.diag)
  }
  await postJson('/debug/clear', {})
  await sleep(1200)
  const single = await postJson('/debug/pending', { count: 1, kind: 'approval', reason: '单条验证' })
  check(single.status === 200 && single.body?.ok === true, 'single fake reminder injected', single.body)
  const singleState = await waitDiag((diag) => /normal=1/u.test(diag) && /folded=0/u.test(diag), 9000)
  const singleFrame = parseFrame(singleState.diag)
  check(singleFrame !== undefined && singleFrame.normal === 1, 'one pending interaction renders exactly one card', singleState.diag)
  await postJson('/debug/clear', {})
  await sleep(900)
  const cleared = await getJson('/pending')
  check(Array.isArray(cleared.body?.pending) && cleared.body.pending.length === 0, 'fake reminders are cleared from the snapshot')

  process.stdout.write(`${JSON.stringify({ ok: failures === 0, port: PORT, statusFile: STATUS_FILE, checks: results.length, failures, results }, undefined, 2)}\n`)
  if (failures > 0) process.exitCode = 1
}

main().catch((error) => {
  process.stderr.write(`verify-live failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
