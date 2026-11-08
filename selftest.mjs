/**
 * Self-test for the 「哨兵 / Sentinel」 dsh-approval-notifier **bundle**.
 *
 * Plain Node, no GUI: verifies the publishable package metadata, the Host
 * Config schema / live volatile reads, the HTTP surface (pending / ack /
 * assets / asset), the opt-in debug status file, and statically guards the
 * browser half:
 *   - it NEVER decides an approval (no decision tokens),
 *   - it NEVER uses OS/Windows notifications (`Notification` is forbidden),
 *   - it carries the 2.0 behaviours (sequential compact cards, lower-left
 *     5s toast, 30s escalation, second reminder, Plugins settings page).
 *
 * Usage: node selftest.mjs
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const failures = []
let checks = 0

const FORBIDDEN_CLIENT_TOKENS = [
  'allowed-once',
  'pending.answer',
  '.answer(',
  '"rejected"',
  "'rejected'",
  'allowOnce',
  'new window.Notification',
  'window.Notification',
  'Notification.permission',
  'new Notification(',
]
const REQUIRED_CLIENT_MARKERS = [
  '哨兵',
  '去处理',
  '提示有效',
  '二次提醒',
  'TOAST_VISIBLE_MS = 5000',
  'plugins.bundle.config',
  'configForms',
  'data-anim',
  'escalation',
  'secondReminder',
  'toast-up',
  'geom=',
  'cw=',
  'LEGACY_IDS',
  "key === 'id'",
  'an-second-banner',
  'playSecondReminderSound',
  'data-second',
  'testReminderIntervalMs',
  'index * interval',
  'sn-shake',
  'shakeUntil',
  'data-stage',
  'max-height:calc(100vh',
  'MIN_FULL_H = 100',
  'COMPACT_MIN_H = 20',
  'CARD_BASE_H = 128',
  'data-tier',
  'sn-compact-line',
  'full-shrunk',
  'layoutRatio',
  'sn-hover',
  'bottomDockTop',
  'dockTop',
  'sn-fold',
  'sn-hl',
  '__DSH_SENTINEL_VIEW__',
  'signatureOf',
  'frame=',
  'compress=',
]
const REQUIRED_PACKAGE_FILES = [
  'lib/host.js',
  'client/client.js',
  'cordis.patch.yml',
  'icon.svg',
  'locale/zh.json',
  'locale/en.json',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
]

function check(condition, label) {
  checks += 1
  if (condition) return
  failures.push(label)
  process.stderr.write(`FAIL: ${label}\n`)
}

function createFakeContext() {
  const effects = []
  const listeners = new Map()
  const routes = new Map()
  const ctx = {
    logger: () => ({ info() {}, warn() {}, error() {} }),
    on(event, listener) {
      listeners.set(event, listener)
      return () => listeners.delete(event)
    },
    effect(fn) {
      effects.push(fn)
    },
    inject(_deps, callback) {
      const scope = {
        webServer: {
          register(route) {
            routes.set(route.path, route)
            return () => routes.delete(route.path)
          },
        },
        effect(fn) {
          effects.push(fn)
        },
      }
      callback(scope)
    },
    get() {
      return undefined
    },
  }
  return {
    ctx,
    listeners,
    routes,
    effects,
    disposeAll: () => {
      for (const fn of effects) {
        const disposer = fn()
        if (typeof disposer === 'function') disposer()
      }
    },
  }
}

function callRoute(route, options = {}) {
  const method = options.method ?? 'GET'
  const url = options.url ?? '/'
  return new Promise((resolve) => {
    const result = { status: 0, headers: {}, body: undefined, raw: Buffer.alloc(0) }
    const handlers = new Map()
    const req = {
      method,
      url,
      on(event, handler) {
        handlers.set(event, handler)
        return req
      },
    }
    const res = {
      writeHead(status, headers) {
        result.status = status
        result.headers = headers ?? {}
      },
      end(body) {
        if (body !== undefined && body !== null) {
          result.raw = Buffer.isBuffer(body) ? body : Buffer.from(String(body))
          const text = result.raw.toString('utf8')
          if (text.length > 0) {
            try {
              result.body = JSON.parse(text)
            } catch {
              result.body = text
            }
          }
        }
        resolve(result)
      },
    }
    let returned
    try {
      returned = route.handler(req, res)
    } catch (error) {
      result.status = 500
      result.body = { error: String(error) }
      resolve(result)
      return
    }
    if (options.body !== undefined) {
      handlers.get('data')?.(Buffer.from(JSON.stringify(options.body)))
      handlers.get('end')?.()
    } else if (method === 'POST') {
      handlers.get('end')?.()
    }
    if (returned !== null && typeof returned === 'object' && typeof returned.then === 'function') {
      returned.catch((error) => {
        result.status = 500
        result.body = { error: String(error) }
        resolve(result)
      })
    }
  })
}

const tick = () => new Promise((resolve) => setImmediate(resolve))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function main() {
  const manifest = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8'))
  check(manifest.name === 'dsh-approval-notifier', 'package name')
  check(/^\d+\.\d+\.\d+$/u.test(String(manifest.version ?? '')), 'package version is semver')
  check(String(manifest.description ?? '').includes('哨兵'), 'description carries the brand')
  check(manifest.type === 'module', 'package is ESM')
  check(manifest.publishConfig?.access === 'public', 'publishConfig is public')
  check(/>=0\.2\.2-rc\.1/u.test(String(manifest.engines?.dsh ?? '')) && /<0\.3\.0-0/u.test(String(manifest.engines?.dsh ?? '')), 'engines.dsh targets the current DSH prerelease line')
  check(/^\^4\./u.test(String(manifest.peerDependencies?.['@deepseek-ai/cordis'] ?? '')), 'cordis peer range spans host releases')
  check(/^\^3\./u.test(String(manifest.peerDependencies?.['@deepseek-ai/schemastery'] ?? '')), 'schemastery peer range spans host releases')
  check(typeof manifest.icon === 'string' && existsSync(join(HERE, manifest.icon)), 'icon exists')
  check(manifest.dsh?.bundle?.patch === './cordis.patch.yml', 'bundle patch declared')
  check(manifest.dsh?.client?.platform === 'web', 'client platform web')
  check(Array.isArray(manifest.dsh?.client?.inject) && manifest.dsh.client.inject.length > 0, 'client inject declared')
  check(Array.isArray(manifest.files) && manifest.files.includes('client') && manifest.files.includes('lib'), 'files whitelist')
  for (const file of REQUIRED_PACKAGE_FILES) check(existsSync(join(HERE, file)), `package file ${file}`)
  for (const locale of ['zh', 'en']) {
    const dictionary = JSON.parse(readFileSync(join(HERE, 'locale', `${locale}.json`), 'utf8'))
    check(typeof dictionary.meta?.title === 'string' && dictionary.meta.title.length > 0, `locale ${locale} meta title`)
    check(typeof dictionary.meta?.description === 'string' && dictionary.meta.description.length > 0, `locale ${locale} meta description`)
  }
  const patchText = readFileSync(join(HERE, 'cordis.patch.yml'), 'utf8')
  check(patchText.includes("id: dsh-approval-notifier"), 'bundle patch inserts the host row')
  check(patchText.includes("name: 'dsh-approval-notifier'"), 'bundle patch uses the package name')

  const clientSource = readFileSync(join(HERE, 'client', 'client.js'), 'utf8')
  let clientSyntax
  try {
    // eslint-disable-next-line no-new-func
    new Function(clientSource)
    clientSyntax = undefined
  } catch (error) {
    clientSyntax = error
  }
  check(clientSyntax === undefined, `client bundle syntax: ${clientSyntax?.message ?? 'ok'}`)
  check(clientSource.includes('window.__ModuleLoader__.load'), 'client registers through __ModuleLoader__')
  check(clientSource.includes('exports.apply = apply'), 'client exports apply')
  for (const token of FORBIDDEN_CLIENT_TOKENS) check(!clientSource.includes(token), `client must not contain ${JSON.stringify(token)}`)
  for (const marker of REQUIRED_CLIENT_MARKERS) check(clientSource.includes(marker), `client carries feature marker ${JSON.stringify(marker)}`)

  const host = await import(`${pathToFileURL(join(HERE, manifest.main)).href}?selftest=${String(Date.now())}`)
  check(host.name === 'dsh-approval-notifier', 'host export name')
  check(Array.isArray(host.inject) && host.inject.includes('webServer'), 'host injects webServer')
  check(typeof host.apply === 'function', 'host export apply')
  check(host.BRAND === '哨兵', 'host brand is 哨兵')
  check(host.Config !== undefined && host.Config !== null, 'host exports a Config schema')
  check(host.Config?.['~standard'] !== undefined, 'Config implements the standard-schema contract')
  const dict = host.Config?.dict
  check(typeof dict === 'object' && dict !== null, 'Config schema exposes fields')
  if (typeof dict === 'object' && dict !== null) {
    for (const field of Object.keys(host.DEFAULTS)) check(Object.hasOwn(dict, field), `Config field ${field}`)
    check(dict.brand?.meta?.volatile === true, 'Config.brand is volatile (official settings form)')
    check(dict.secondReminderIdleMs?.meta?.volatile === true, 'Config.secondReminderIdleMs is volatile')
  }
  check(typeof host.settingsOf === 'function', 'host exports settingsOf')
  check(host.settingsOf({ ...host.DEFAULTS }).escalation.intervalMs === 30000, 'settingsOf default escalation interval')
  check(host.settingsOf({ ...host.DEFAULTS }).testReminderIntervalMs === 3000, 'settingsOf default test reminder interval is 3s')

  const tempHome = mkdtempSync(join(tmpdir(), 'sentinel-home-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = tempHome
  const statusFile = join(tempHome, 'approval-notifier', 'status.json')
  try {
    const current = { ...host.DEFAULTS, debug: true, brand: '哨兵' }
    const refs = Object.fromEntries(Object.keys(host.DEFAULTS).map((field) => [field, { get: () => current[field] }]))
    const fake = createFakeContext()
    host.apply(fake.ctx, refs)
    await tick()
    await sleep(450)

    check(fake.listeners.has('approval/request'), 'approval/request observer registered')
    check(fake.listeners.has('user-questions/request'), 'user-questions/request observer registered')
    check(fake.routes.has('/dsh-approval-notifier/pending'), 'pending route registered')
    check(fake.routes.has('/dsh-approval-notifier/ack'), 'ack route registered')
    check(fake.routes.has('/dsh-approval-notifier/assets'), 'assets route registered')
    check(fake.routes.has('/dsh-approval-notifier/asset'), 'asset prefix route registered')
    check(!fake.routes.has('/dsh-approval-notifier/settings'), 'legacy settings route removed (official Config instead)')
    check(existsSync(statusFile), 'opt-in debug status file written')

    const status = JSON.parse(readFileSync(statusFile, 'utf8'))
    check(status.brand === '哨兵', 'status brand')
    check(status.debug === true, 'status marks debug')
    check(status.configRevision?.length === 12, 'status carries config revision')

    const pendingRoute = await callRoute(fake.routes.get('/dsh-approval-notifier/pending'), { method: 'GET' })
    check(pendingRoute.status === 200, 'pending route answers 200')
    check(pendingRoute.body?.brand === '哨兵', 'pending carries brand')
    check(pendingRoute.body?.settings?.escalation?.intervalMs === 30000, 'pending carries settings')
    check(pendingRoute.body?.settings?.secondReminder?.idleMs === 10000, 'pending carries second reminder idle')
    const revisionBefore = pendingRoute.body?.configRevision
    check(typeof revisionBefore === 'string' && revisionBefore.length === 12, 'pending carries config revision')

    // Live volatile read: mutate the ref the way the settings form would.
    current.brand = '哨兵2'
    current.secondReminderIdleMs = 12000
    const livePending = await callRoute(fake.routes.get('/dsh-approval-notifier/pending'), { method: 'GET' })
    check(livePending.body?.brand === '哨兵2', 'host reads volatile brand live')
    check(livePending.body?.settings?.secondReminder?.idleMs === 12000, 'host reads volatile second-reminder value live')
    check(livePending.body?.configRevision !== revisionBefore, 'config revision follows live edits')
    current.brand = '哨兵'
    current.secondReminderIdleMs = 10000

    // Pending approval flows through untouched.
    const pendingApproval = fake.listeners.get('approval/request')(
      { agent: { session: { id: 'session-1' } }, toolName: 'pwsh', callId: 'call-1', reason: '需要越权执行命令' },
      () => new Promise((resolve) => setTimeout(() => resolve('allowed-once'), 30)),
    )
    await tick()
    const approvalPending = await callRoute(fake.routes.get('/dsh-approval-notifier/pending'), { method: 'GET' })
    check(approvalPending.body?.pending?.length === 1, 'one pending approval recorded')
    check(approvalPending.body?.pending?.[0]?.kind === 'approval', 'pending kind approval')
    check(approvalPending.body?.pending?.[0]?.sessionId === 'session-1', 'pending session id')
    check(approvalPending.body?.pending?.[0]?.toolName === 'pwsh', 'pending tool name')
    check((await pendingApproval) === 'allowed-once', 'waterfall next() result passes through unchanged')
    await tick()
    const afterApproval = await callRoute(fake.routes.get('/dsh-approval-notifier/pending'), { method: 'GET' })
    check(afterApproval.body?.pending?.length === 0, 'pending clears after approval settles')

    // User question + ack diagnostics.
    const controller = new AbortController()
    const questionPromise = fake.listeners.get('user-questions/request')(
      { agent: { session: { id: 'session-2' } }, questions: [{ id: 'q1', question: '继续吗？' }, { id: 'q2', question: '保留备份吗？' }], signal: controller.signal },
      () => new Promise((_resolve, reject) => controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })),
    )
    await tick()
    const questionPending = await callRoute(fake.routes.get('/dsh-approval-notifier/pending'), { method: 'GET' })
    check(questionPending.body?.pending?.[0]?.questionCount === 2, 'question count recorded')
    const ackResult = await callRoute(fake.routes.get('/dsh-approval-notifier/ack'), {
      method: 'POST',
      body: { ids: [questionPending.body.pending[0].id], via: 'opened;focus=1;hidden=0;perm=in-harness' },
    })
    check(ackResult.body?.ok === true, 'ack route answers ok')
    await sleep(350)
    const ackStatus = JSON.parse(readFileSync(statusFile, 'utf8'))
    check(ackStatus.recent?.some((event) => event.type === 'client/opened'), 'ack records the opened action')
    controller.abort()
    try {
      await questionPromise
    } catch {}
    await tick()

    // Local media assets.
    const upload = await callRoute(fake.routes.get('/dsh-approval-notifier/assets'), {
      method: 'POST',
      body: { name: 'dot.png', mime: 'image/png', dataBase64: TINY_PNG_BASE64 },
    })
    check(upload.status === 200 && upload.body?.ok === true, 'asset upload answers ok')
    const asset = upload.body?.asset
    check(typeof asset?.id === 'string' && /^[a-f0-9]{12}$/u.test(asset.id), 'asset id is hashed')
    check(asset?.url === `/dsh-approval-notifier/asset/${String(asset?.id)}`, 'asset url advertised')
    const assetResponse = await callRoute(fake.routes.get('/dsh-approval-notifier/asset'), {
      method: 'GET',
      url: `/dsh-approval-notifier/asset/${String(asset?.id)}`,
    })
    check(assetResponse.status === 200 && assetResponse.headers['content-type'] === 'image/png', 'asset GET serves the image type')
    check(assetResponse.raw.length > 0 && assetResponse.raw[0] === 0x89, 'asset GET serves the uploaded bytes')
    const assetList = await callRoute(fake.routes.get('/dsh-approval-notifier/assets'), { method: 'GET' })
    check(Array.isArray(assetList.body?.assets) && assetList.body.assets.length === 1, 'asset list answers')
    const badUpload = await callRoute(fake.routes.get('/dsh-approval-notifier/assets'), {
      method: 'POST',
      body: { name: 'note.txt', mime: 'text/plain', dataBase64: Buffer.from('hello').toString('base64') },
    })
    check(badUpload.status === 400, 'asset upload rejects unsupported media')
    const missingAsset = await callRoute(fake.routes.get('/dsh-approval-notifier/asset'), { method: 'GET', url: '/dsh-approval-notifier/asset/000000000000' })
    check(missingAsset.status === 404, 'unknown asset answers 404')

    // Dev-only (debug:true) fake-pending routes used to verify the toast layout.
    const debugAdd = await callRoute(fake.routes.get('/dsh-approval-notifier/debug/pending'), {
      method: 'POST',
      body: { count: 3, kind: 'approval', reason: '调试提醒' },
    })
    check(debugAdd.status === 200 && debugAdd.body?.ok === true, 'debug pending route answers ok')
    check(Array.isArray(debugAdd.body?.ids) && debugAdd.body.ids.length === 3, 'debug pending injects the requested count')
    const debugSnapshot = await callRoute(fake.routes.get('/dsh-approval-notifier/pending'), { method: 'GET' })
    check(debugSnapshot.body?.pending?.length === 3, 'debug pending appears in the pending snapshot')
    const debugSessions = new Set((debugSnapshot.body?.pending ?? []).map((item) => item.sessionId))
    const debugCalls = new Set((debugSnapshot.body?.pending ?? []).map((item) => item.callId))
    check(debugSessions.size === 3, 'each fake reminder has a unique session id (no card dedupe)')
    check(debugCalls.size === 3, 'each fake reminder has a unique call id')
    const debugClear = await callRoute(fake.routes.get('/dsh-approval-notifier/debug/clear'), { method: 'POST' })
    check(debugClear.status === 200 && debugClear.body?.removed === 3, 'debug clear removes the fake reminders')
    const clearedSnapshot = await callRoute(fake.routes.get('/dsh-approval-notifier/pending'), { method: 'GET' })
    check(clearedSnapshot.body?.pending?.length === 0, 'fake reminders are cleared again')

    await sleep(350)
    const finalStatus = JSON.parse(readFileSync(statusFile, 'utf8'))
    check(finalStatus.stats.approvalRequests === 1, 'status tracks approval requests')
    check(finalStatus.stats.questionRequests === 1, 'status tracks question requests')
    check(finalStatus.stats.assetUploads === 1, 'status tracks asset uploads')
    check(finalStatus.recent?.some((event) => event.type === 'client/first-poll'), 'recent ring records client polls')

    // Teardown: routes removed, disposed snapshot written.
    fake.disposeAll()
    await tick()
    const disposed = JSON.parse(readFileSync(statusFile, 'utf8'))
    check(disposed.disposed === true, 'teardown marks status disposed')
    check(!fake.routes.has('/dsh-approval-notifier/pending'), 'teardown removes routes')
    rmSync(tempHome, { recursive: true, force: true })

    // Debug off: no file is written at all.
    const quietHome = mkdtempSync(join(tmpdir(), 'sentinel-quiet-'))
    process.env.DSH_HOME = quietHome
    const quietFake = createFakeContext()
    const quietConfig = { ...host.DEFAULTS, debug: false }
    host.apply(quietFake.ctx, quietConfig)
    await tick()
    await sleep(300)
    check(!existsSync(join(quietHome, 'approval-notifier', 'status.json')), 'debug off writes no status file')
    const quietDebug = await callRoute(quietFake.routes.get('/dsh-approval-notifier/debug/pending'), { method: 'POST', body: { count: 1 } })
    check(quietDebug.status === 404, 'debug-only fake-pending route is closed when debug is off')
    quietFake.disposeAll()
    rmSync(quietHome, { recursive: true, force: true })
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
  }

  // Optional extra file used by packaging: a CHANGELOG mentioning the version.
  check(readFileSync(join(HERE, 'CHANGELOG.md'), 'utf8').includes(String(manifest.version)), 'CHANGELOG mentions the current version')

  process.stdout.write(`\nselftest: ${String(checks - failures.length)}/${String(checks)} checks passed\n`)
  if (failures.length > 0) {
    process.stderr.write(`selftest failed: ${String(failures.length)} check(s)\n`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  process.stderr.write(`selftest crashed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
