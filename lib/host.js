/**
 * dsh-approval-notifier / host half — 「哨兵 / Sentinel」.
 *
 * Standard DSH bundle host half. It observes the two human-confirmation
 * waterfalls of the Harness process — `approval/request` and
 * `user-questions/request` — for EVERY session/workspace, serves the pending
 * snapshot the browser half polls, and stores/returns uploaded local media.
 *
 * It NEVER answers an approval or a question: the observer is prepended, and it
 * always passes the chain on (`next()`); the human alone decides.
 *
 * Preferences are declared as a schemastery `Config` whose fields are all
 * `.volatile()`: the official DSH settings service therefore exposes them to the
 * Plugins page configuration form registered by the browser half
 * (`ctx.configForms.get('dsh-approval-notifier')`), and the values persist in
 * the profile's `cordis.patch.yml` through the official settings/config editor.
 * Live edits update the volatile references in place; this plugin reads them on
 * demand with `.get()`.
 *
 * @module dsh-approval-notifier
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'

/** Cordis plugin name. */
export const name = 'dsh-approval-notifier'

/** Required service: the route carrier used by the browser half. */
export const inject = ['webServer']

/** Route the browser half polls. Document-relative in the browser; absolute here. */
export const PENDING_ROUTE = '/dsh-approval-notifier/pending'
/** Route the browser half posts acknowledgement / diagnostics to. */
export const ACK_ROUTE = '/dsh-approval-notifier/ack'
/** Uploaded local media: POST to upload, GET to list. */
export const ASSETS_ROUTE = '/dsh-approval-notifier/assets'
/** Prefix under which uploaded assets are served back. */
export const ASSET_PREFIX = '/dsh-approval-notifier/asset'
/** Dev-only (debug:true) route that injects fake pending reminders to verify the toast layout. */
export const DEBUG_PENDING_ROUTE = '/dsh-approval-notifier/debug/pending'
/** Dev-only (debug:true) route that clears the fake pending reminders. */
export const DEBUG_CLEAR_ROUTE = '/dsh-approval-notifier/debug/clear'

/** Brand shown in the browser half and in the Plugins page. */
export const BRAND = '哨兵'
/** Version of the live preference schema documented in the README. */
const SETTINGS_VERSION = 1

/** Animation preset ids the configuration form offers (default pops up from the bottom edge). */
export const ANIMATION_PRESETS = ['toast-up', 'slide-right', 'fade-up', 'bounce', 'flip', 'zoom', 'none']
/** First-alert sound preset ids. */
export const SOUND_PRESETS = ['chime', 'classic', 'soft', 'urgent', 'mechanical', 'none']
/** Escalation sound preset ids (deliberately different from the first alert). */
export const ESCALATION_SOUND_PRESETS = ['urgent-alarm', 'rapid-beeps', 'chime-double', 'none']
/** Media reference kinds accepted by the form / stored config. */
export const ASSET_KINDS = ['none', 'url', 'asset']

/** Flat, form-friendly live defaults (mirrors the Config schema below). */
export const DEFAULTS = Object.freeze({
  brand: BRAND,
  animationPreset: 'toast-up',
  animationStaggerMs: 700,
  customImageKind: 'none',
  customImageUrl: '',
  customImageAssetId: '',
  soundPreset: 'chime',
  soundVolume: 0.6,
  customSoundKind: 'none',
  customSoundUrl: '',
  customSoundAssetId: '',
  escalationEnabled: true,
  escalationIntervalMs: 30000,
  escalationMaxStages: 5,
  escalationScaleStep: 0.06,
  escalationScaleMax: 0.3,
  escalationVolumeStep: 0.12,
  escalationSoundPreset: 'urgent-alarm',
  customEscalationSoundKind: 'none',
  customEscalationSoundUrl: '',
  customEscalationSoundAssetId: '',
  titleFlash: true,
  secondReminderEnabled: true,
  secondReminderIdleMs: 10000,
  testReminderIntervalMs: 3000,
  debug: false,
})

const animationUnion = z.union(ANIMATION_PRESETS)
const soundUnion = z.union(SOUND_PRESETS)
const escalationUnion = z.union(ESCALATION_SOUND_PRESETS)
const assetKindUnion = z.union(ASSET_KINDS)

/**
 * Live preference schema. Every field is volatile so the official DSH settings
 * service serves it to the Plugins page form and applies edits in place.
 * Field names are flat on purpose: the form writes one schema path per change.
 */
export const Config = z.object({
  brand: z.string().default(DEFAULTS.brand).volatile(),
  animationPreset: animationUnion.default(DEFAULTS.animationPreset).volatile(),
  animationStaggerMs: z.number().default(DEFAULTS.animationStaggerMs).volatile(),
  customImageKind: assetKindUnion.default(DEFAULTS.customImageKind).volatile(),
  customImageUrl: z.string().default(DEFAULTS.customImageUrl).volatile(),
  customImageAssetId: z.string().default(DEFAULTS.customImageAssetId).volatile(),
  soundPreset: soundUnion.default(DEFAULTS.soundPreset).volatile(),
  soundVolume: z.number().default(DEFAULTS.soundVolume).volatile(),
  customSoundKind: assetKindUnion.default(DEFAULTS.customSoundKind).volatile(),
  customSoundUrl: z.string().default(DEFAULTS.customSoundUrl).volatile(),
  customSoundAssetId: z.string().default(DEFAULTS.customSoundAssetId).volatile(),
  escalationEnabled: z.boolean().default(DEFAULTS.escalationEnabled).volatile(),
  escalationIntervalMs: z.number().default(DEFAULTS.escalationIntervalMs).volatile(),
  escalationMaxStages: z.number().default(DEFAULTS.escalationMaxStages).volatile(),
  escalationScaleStep: z.number().default(DEFAULTS.escalationScaleStep).volatile(),
  escalationScaleMax: z.number().default(DEFAULTS.escalationScaleMax).volatile(),
  escalationVolumeStep: z.number().default(DEFAULTS.escalationVolumeStep).volatile(),
  escalationSoundPreset: escalationUnion.default(DEFAULTS.escalationSoundPreset).volatile(),
  customEscalationSoundKind: assetKindUnion.default(DEFAULTS.customEscalationSoundKind).volatile(),
  customEscalationSoundUrl: z.string().default(DEFAULTS.customEscalationSoundUrl).volatile(),
  customEscalationSoundAssetId: z.string().default(DEFAULTS.customEscalationSoundAssetId).volatile(),
  titleFlash: z.boolean().default(DEFAULTS.titleFlash).volatile(),
  secondReminderEnabled: z.boolean().default(DEFAULTS.secondReminderEnabled).volatile(),
  secondReminderIdleMs: z.number().default(DEFAULTS.secondReminderIdleMs).volatile(),
  testReminderIntervalMs: z.number().default(DEFAULTS.testReminderIntervalMs).volatile(),
  debug: z.boolean().default(DEFAULTS.debug).volatile(),
})

/** Maximum entries kept in the in-memory recent-event ring. */
const RECENT_LIMIT = 40
/** Status file write coalescing window. */
const STATUS_WRITE_DELAY_MS = 200
/** Maximum accepted JSON body size (acknowledgements). */
const MAX_JSON_BYTES = 64 * 1024
/** Maximum accepted upload body size (base64-encoded JSON). */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
/** Uploaded image and audio size caps (decoded bytes). */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const MAX_AUDIO_BYTES = 5 * 1024 * 1024
/** Maximum number of retained uploaded assets. */
const MAX_ASSETS = 20

/** Extension → served media type for uploaded assets. */
const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
}
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.webm'])

/** Resolve the DeepSeek Harness home (same rules as the rest of DSH). */
export function resolveDshHome() {
  const fromEnv = (process.env.DSH_HOME ?? '').trim()
  if (fromEnv.length > 0) return fromEnv
  return join(homedir(), '.dsh')
}

/** Short stable hash used for revisions and asset ids. */
function shortHash(input) {
  return createHash('sha1').update(input).digest('hex').slice(0, 12)
}

/**
 * Read one Config field: a volatile reference (`.get()`) or a plain value
 * (used by unit tests and by callers that build a detached settings object).
 */
export function readConfig(value, fallback) {
  if (value === undefined) return fallback
  if (value === null) return fallback
  if (typeof value === 'object' && typeof value.get === 'function') {
    const current = (() => {
      try {
        return value.get()
      } catch {
        return undefined
      }
    })()
    return current === undefined ? fallback : current
  }
  return value
}

/** Clamp a numeric preference. */
function clamp(value, min, max, fallback) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(Math.max(numeric, min), max)
}

/** Sanitize one asset reference field triple. */
function assetRef(kind, url, assetId) {
  const resolvedKind = ASSET_KINDS.includes(readConfig(kind, 'none')) ? readConfig(kind, 'none') : 'none'
  if (resolvedKind === 'url') {
    const value = String(readConfig(url, '')).trim()
    if (!/^https?:\/\//iu.test(value) || value.length > 2048) return { kind: 'none', url: '', assetId: '' }
    return { kind: 'url', url: value, assetId: '' }
  }
  if (resolvedKind === 'asset') {
    const id = String(readConfig(assetId, '')).trim()
    if (!/^[a-f0-9]{12}$/u.test(id)) return { kind: 'none', url: '', assetId: '' }
    return { kind: 'asset', url: `${ASSET_PREFIX}/${id}`, assetId: id }
  }
  return { kind: 'none', url: '', assetId: '' }
}

/**
 * Build the detached, clamped settings object handed to the browser half.
 * @param {object} config - plugin config (volatile refs or plain values).
 * @returns {object} browser-facing settings.
 */
export function settingsOf(config = {}) {
  const animationPreset = ANIMATION_PRESETS.includes(readConfig(config.animationPreset, DEFAULTS.animationPreset))
    ? readConfig(config.animationPreset, DEFAULTS.animationPreset)
    : DEFAULTS.animationPreset
  const soundPreset = SOUND_PRESETS.includes(readConfig(config.soundPreset, DEFAULTS.soundPreset))
    ? readConfig(config.soundPreset, DEFAULTS.soundPreset)
    : DEFAULTS.soundPreset
  const escalationSoundPreset = ESCALATION_SOUND_PRESETS.includes(readConfig(config.escalationSoundPreset, DEFAULTS.escalationSoundPreset))
    ? readConfig(config.escalationSoundPreset, DEFAULTS.escalationSoundPreset)
    : DEFAULTS.escalationSoundPreset
  return {
    version: SETTINGS_VERSION,
    brand: String(readConfig(config.brand, DEFAULTS.brand) || DEFAULTS.brand).slice(0, 24),
    animation: {
      preset: animationPreset,
      staggerMs: Math.trunc(clamp(readConfig(config.animationStaggerMs, DEFAULTS.animationStaggerMs), 0, 2000, DEFAULTS.animationStaggerMs)),
      customImage: assetRef(config.customImageKind, config.customImageUrl, config.customImageAssetId),
    },
    sound: {
      preset: soundPreset,
      volume: clamp(readConfig(config.soundVolume, DEFAULTS.soundVolume), 0, 1, DEFAULTS.soundVolume),
      custom: assetRef(config.customSoundKind, config.customSoundUrl, config.customSoundAssetId),
    },
    escalation: {
      enabled: readConfig(config.escalationEnabled, DEFAULTS.escalationEnabled) !== false,
      intervalMs: Math.trunc(clamp(readConfig(config.escalationIntervalMs, DEFAULTS.escalationIntervalMs), 10000, 300000, DEFAULTS.escalationIntervalMs)),
      maxStages: Math.trunc(clamp(readConfig(config.escalationMaxStages, DEFAULTS.escalationMaxStages), 1, 10, DEFAULTS.escalationMaxStages)),
      scaleStep: clamp(readConfig(config.escalationScaleStep, DEFAULTS.escalationScaleStep), 0, 0.2, DEFAULTS.escalationScaleStep),
      scaleMax: clamp(readConfig(config.escalationScaleMax, DEFAULTS.escalationScaleMax), 0, 0.6, DEFAULTS.escalationScaleMax),
      volumeStep: clamp(readConfig(config.escalationVolumeStep, DEFAULTS.escalationVolumeStep), 0, 0.5, DEFAULTS.escalationVolumeStep),
      sound: {
        preset: escalationSoundPreset,
        custom: assetRef(config.customEscalationSoundKind, config.customEscalationSoundUrl, config.customEscalationSoundAssetId),
      },
    },
    titleFlash: readConfig(config.titleFlash, DEFAULTS.titleFlash) !== false,
    secondReminder: {
      enabled: readConfig(config.secondReminderEnabled, DEFAULTS.secondReminderEnabled) !== false,
      idleMs: Math.trunc(clamp(readConfig(config.secondReminderIdleMs, DEFAULTS.secondReminderIdleMs), 3000, 120000, DEFAULTS.secondReminderIdleMs)),
    },
    testReminderIntervalMs: Math.trunc(clamp(readConfig(config.testReminderIntervalMs, DEFAULTS.testReminderIntervalMs), 1000, 30000, DEFAULTS.testReminderIntervalMs)),
  }
}

/** Resolve the session id that owns a waterfall request. */
export function sessionIdOf(request) {
  const agent = request?.agent
  const session = agent?.session
  if (session !== undefined && session !== null && typeof session.id === 'string') return session.id
  if (typeof agent?.id === 'string') return agent.id
  return undefined
}

/** Flatten the tool-supplied reason into one display string. */
export function reasonOf(request) {
  if (request === undefined || request === null) return ''
  if (typeof request.reason === 'string' && request.reason.length > 0) return request.reason
  const display = request.displayReason
  if (display !== null && typeof display === 'object') {
    for (const key of ['zh-CN', 'zh', 'en']) {
      if (typeof display[key] === 'string' && display[key].length > 0) return display[key]
    }
    for (const value of Object.values(display)) if (typeof value === 'string' && value.length > 0) return value
  }
  return ''
}

/** Extract a safe, compact summary of a user-question request. */
function questionOf(request) {
  const questions = Array.isArray(request?.questions) ? request.questions : []
  const first = questions[0]
  return {
    question: typeof first?.question === 'string' ? first.question : '',
    header: typeof first?.header === 'string' ? first.header : '',
    count: questions.length,
  }
}

/** Read a request body with a hard byte cap. */
function readBody(req, limit) {
  return new Promise((resolve) => {
    let size = 0
    let tooLarge = false
    const chunks = []
    req.on('data', (chunk) => {
      if (tooLarge) return
      size += chunk.length
      if (size > limit) {
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8'), tooLarge }))
    req.on('error', () => resolve({ text: '', tooLarge: false }))
  })
}

/** Read and parse a JSON request body. */
async function readJsonBody(req, limit) {
  const { text, tooLarge } = await readBody(req, limit)
  if (tooLarge) return { tooLarge: true, value: undefined }
  try {
    return { tooLarge: false, value: JSON.parse(text) }
  } catch {
    return { tooLarge: false, value: undefined, invalid: true }
  }
}

/** Detect the real media kind of uploaded bytes from their signature. */
function sniffMedia(bytes, ext) {
  if (bytes.length < 12) return false
  const ascii = (offset, text) => bytes.subarray(offset, offset + text.length).toString('latin1') === text
  if (ext === '.png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (ext === '.jpg' || ext === '.jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8
  if (ext === '.gif') return ascii(0, 'GIF8')
  if (ext === '.webp') return ascii(0, 'RIFF') && ascii(8, 'WEBP')
  if (ext === '.mp3') return ascii(0, 'ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  if (ext === '.wav') return ascii(0, 'RIFF') && ascii(8, 'WAVE')
  if (ext === '.ogg') return ascii(0, 'OggS')
  if (ext === '.m4a') return ascii(4, 'ftyp')
  if (ext === '.webm') return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
  return false
}

/** Best-effort read of this package's version for diagnostics. */
function readPackageVersion() {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const manifest = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'))
    return typeof manifest.version === 'string' ? manifest.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/**
 * Install the observer, settings reader, asset store, and HTTP routes.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} [config] - live config (volatile refs or plain values).
 */
export function apply(ctx, config = {}) {
  const dshHome = resolveDshHome()
  const paths = {
    assetsDir: join(dshHome, 'approval-notifier', 'assets'),
    statusFile: join(dshHome, 'approval-notifier', 'status.json'),
  }
  const logger = typeof ctx.logger === 'function' ? ctx.logger('approval-notifier') : console
  const packageVersion = readPackageVersion()
  const startedAt = Date.now()

  /** @type {Map<string, object>} */
  const pending = new Map()
  let sequence = 0
  const stats = {
    approvalRequests: 0,
    questionRequests: 0,
    lastApprovalAt: 0,
    lastQuestionAt: 0,
    clientPolls: 0,
    lastPollAt: 0,
    lastAckAt: 0,
    ackCount: 0,
    lastClientDiag: '',
    assetUploads: 0,
  }
  const recent = []
  let writeTimer
  let disposed = false
  let lastStatusAt = 0

  /** Uploaded asset records: id → {id,name,mime,size,createdAt}. */
  const assets = new Map()

  /** Whether the opt-in diagnostic status file is currently enabled. */
  function debugEnabled() {
    return readConfig(config.debug, false) === true
  }

  function record(type, fields = {}) {
    recent.push({ at: Date.now(), type, ...fields })
    if (recent.length > RECENT_LIMIT) recent.splice(0, recent.length - RECENT_LIMIT)
  }

  /** Persist the asset index (best effort). */
  function saveAssetIndex() {
    const target = join(paths.assetsDir, 'index.json')
    const temp = `${target}.${String(process.pid)}.tmp`
    try {
      mkdirSync(paths.assetsDir, { recursive: true })
      writeFileSync(temp, `${JSON.stringify({ version: 1, assets: [...assets.values()] }, undefined, 2)}\n`, 'utf8')
      renameSync(temp, target)
    } catch (error) {
      logger.warn?.('failed to save asset index: %s', String(error))
      try {
        unlinkSync(temp)
      } catch {}
    }
  }

  /** Load the asset index once at apply time. */
  function loadAssets() {
    try {
      if (!existsSync(paths.assetsDir)) return
      const indexPath = join(paths.assetsDir, 'index.json')
      if (!existsSync(indexPath)) return
      const parsed = JSON.parse(readFileSync(indexPath, 'utf8'))
      const list = Array.isArray(parsed?.assets) ? parsed.assets : []
      for (const item of list) {
        if (item === null || typeof item !== 'object') continue
        if (typeof item.id !== 'string' || !/^[a-f0-9]{12}$/u.test(item.id)) continue
        if (typeof item.mime !== 'string') continue
        const file = join(paths.assetsDir, item.id)
        if (!existsSync(file)) continue
        assets.set(item.id, {
          id: item.id,
          name: typeof item.name === 'string' ? item.name : 'asset',
          mime: item.mime,
          size: Number.isFinite(item.size) ? item.size : statSync(file).size,
          createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
        })
      }
      for (const entry of readdirSync(paths.assetsDir)) {
        if (entry === 'index.json') continue
        if (!assets.has(entry)) {
          try {
            unlinkSync(join(paths.assetsDir, entry))
          } catch {}
        }
      }
    } catch (error) {
      logger.warn?.('failed to load asset index: %s', String(error))
    }
  }

  /** Current detached settings for the browser half / diagnostics. */
  function currentSettings() {
    return settingsOf(config)
  }

  function snapshot() {
    const settings = currentSettings()
    return {
      plugin: 'dsh-approval-notifier',
      brand: settings.brand,
      version: packageVersion,
      hostPid: typeof process.pid === 'number' ? process.pid : undefined,
      startedAt,
      updatedAt: Date.now(),
      disposed,
      pendingCount: pending.size,
      pending: [...pending.values()],
      stats: { ...stats },
      configRevision: shortHash(JSON.stringify(settings)),
      settings,
      debug: debugEnabled(),
      assetsDir: paths.assetsDir,
      assetsCount: assets.size,
      assets: [...assets.values()].map(({ id, name, mime, size }) => ({ id, name, mime, size, url: `${ASSET_PREFIX}/${id}` })),
      routes: {
        pending: PENDING_ROUTE,
        ack: ACK_ROUTE,
        assets: ASSETS_ROUTE,
        asset: `${ASSET_PREFIX}/<id>`,
      },
      recent: [...recent],
    }
  }

  function scheduleStatusWrite() {
    if (!debugEnabled() || disposed) return
    if (writeTimer !== undefined) return
    writeTimer = setTimeout(() => {
      writeTimer = undefined
      writeStatusNow()
    }, STATUS_WRITE_DELAY_MS)
    if (typeof writeTimer.unref === 'function') writeTimer.unref()
  }

  function writeStatusNow() {
    if (!debugEnabled()) return
    lastStatusAt = Date.now()
    const target = paths.statusFile
    const temp = `${target}.${String(process.pid)}.tmp`
    try {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(temp, JSON.stringify(snapshot(), undefined, 2), 'utf8')
      renameSync(temp, target)
    } catch (error) {
      logger.warn?.('failed to write status file %s: %s', target, String(error))
      try {
        unlinkSync(temp)
      } catch {}
    }
  }

  /** Send one JSON response. */
  function sendJson(res, status, payload) {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
    })
    res.end(body)
  }

  /**
   * Observe one human-confirmation waterfall request, then continue the chain.
   * Prepended so it runs before the browser-forwarding listener; it NEVER
   * changes the decision, it only records and passes through.
   */
  function observe(kind, request, next) {
    const at = Date.now()
    const sessionId = sessionIdOf(request)
    const id = `${kind}:${String(++sequence)}:${at.toString(36)}`
    const question = kind === 'question' ? questionOf(request) : undefined
    const item = {
      id,
      kind,
      at,
      sessionId,
      toolName: typeof request?.toolName === 'string' ? request.toolName : kind === 'question' ? 'ask_user_question' : undefined,
      reason: kind === 'approval' ? reasonOf(request) : question.question,
      header: question !== undefined && question.header.length > 0 ? question.header : undefined,
      questionCount: question !== undefined ? question.count : undefined,
      callId: request?.callId === undefined ? undefined : String(request.callId),
    }
    pending.set(id, item)
    if (kind === 'approval') {
      stats.approvalRequests += 1
      stats.lastApprovalAt = at
    } else {
      stats.questionRequests += 1
      stats.lastQuestionAt = at
    }
    record(kind, { sessionId, toolName: item.toolName, reason: item.reason })
    logger.info?.('%s request waiting for user (session %s, %s)', kind, sessionId ?? 'unknown', item.toolName ?? '')
    scheduleStatusWrite()

    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      pending.delete(id)
      record(`${kind}/settled`, { sessionId, toolName: item.toolName })
      scheduleStatusWrite()
    }

    let result
    try {
      const signal = request?.signal
      if (signal !== undefined && signal !== null && typeof signal.addEventListener === 'function') {
        if (signal.aborted === true) {
          settle()
          return next()
        }
        signal.addEventListener('abort', settle, { once: true })
      }
      result = next()
    } catch (error) {
      settle()
      throw error
    }
    if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
      return result.then(
        (value) => {
          settle()
          return value
        },
        (error) => {
          settle()
          throw error
        },
      )
    }
    settle()
    return result
  }

  /** Poll handler: pending snapshot + the effective settings. */
  const pendingHandler = async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' })
      res.end()
      return
    }
    stats.clientPolls += 1
    stats.lastPollAt = Date.now()
    if (stats.clientPolls === 1) record('client/first-poll')
    try {
      const diag = new URL(req.url ?? '/', 'http://dsh.invalid').searchParams.get('diag')
      if (typeof diag === 'string' && diag.length > 0) {
        const value = diag.slice(0, 600)
        if (value !== stats.lastClientDiag) {
          stats.lastClientDiag = value
          record('client/diag', { diag: value })
        }
      }
    } catch {}
    if (stats.clientPolls === 1 || pending.size > 0) scheduleStatusWrite()
    const settings = currentSettings()
    const payload = {
      plugin: 'dsh-approval-notifier',
      brand: settings.brand,
      version: packageVersion,
      now: stats.lastPollAt,
      pending: [...pending.values()],
      settings,
      configRevision: shortHash(JSON.stringify(settings)),
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, max-age=0' })
      res.end()
      return
    }
    sendJson(res, 200, payload)
  }

  /** Acknowledgement / action diagnostics from the browser half. */
  const ackHandler = async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' })
      res.end()
      return
    }
    const parsed = await readJsonBody(req, MAX_JSON_BYTES)
    if (parsed.tooLarge) {
      sendJson(res, 413, { ok: false, error: 'body too large' })
      return
    }
    if (!parsed.value || typeof parsed.value !== 'object') {
      sendJson(res, 400, { ok: false, error: 'invalid JSON body' })
      return
    }
    const ids = Array.isArray(parsed.value.ids) ? parsed.value.ids.filter((value) => typeof value === 'string').slice(0, 50) : []
    const via = typeof parsed.value.via === 'string' ? parsed.value.via.slice(0, 400) : undefined
    stats.ackCount += 1
    stats.lastAckAt = Date.now()
    record('client/ack', { ids, via })
    if (via !== undefined) {
      const action = via.split(';')[0]
      if (action.length > 0) record(`client/${action}`, { ids })
    }
    scheduleStatusWrite()
    sendJson(res, 200, { ok: true, pendingCount: pending.size })
  }

  /** Media asset upload (local image/GIF/audio used by the settings form). */
  const assetsHandler = async (req, res) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end()
        return
      }
      sendJson(res, 200, {
        ok: true,
        assets: [...assets.values()].map(({ id, name, mime, size }) => ({ id, name, mime, size, url: `${ASSET_PREFIX}/${id}` })),
      })
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'GET, HEAD, POST' })
      res.end()
      return
    }
    if (assets.size >= MAX_ASSETS) {
      sendJson(res, 409, { ok: false, error: `最多保留 ${String(MAX_ASSETS)} 个本地素材，请先清理` })
      return
    }
    const parsed = await readJsonBody(req, MAX_UPLOAD_BYTES)
    if (parsed.tooLarge) {
      sendJson(res, 413, { ok: false, error: '上传内容过大' })
      return
    }
    if (!parsed.value || typeof parsed.value !== 'object') {
      sendJson(res, 400, { ok: false, error: '请求体必须是 JSON 对象' })
      return
    }
    const fileName = typeof parsed.value.name === 'string' ? parsed.value.name.trim().slice(0, 120) : 'asset'
    const dataBase64 = typeof parsed.value.dataBase64 === 'string' ? parsed.value.dataBase64 : ''
    const ext = extname(fileName).toLowerCase()
    const isImage = IMAGE_EXTS.has(ext)
    const isAudio = AUDIO_EXTS.has(ext)
    if (!isImage && !isAudio) {
      sendJson(res, 400, { ok: false, error: '仅支持图片（png/jpg/gif/webp）或音频（mp3/wav/ogg/m4a/webm）' })
      return
    }
    let bytes
    try {
      bytes = Buffer.from(dataBase64, 'base64')
    } catch {
      sendJson(res, 400, { ok: false, error: 'base64 数据无效' })
      return
    }
    if (bytes.length === 0) {
      sendJson(res, 400, { ok: false, error: '文件内容为空' })
      return
    }
    const limit = isImage ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES
    if (bytes.length > limit) {
      sendJson(res, 413, { ok: false, error: `文件超过上限（${String(Math.round(limit / 1024 / 1024))}MB）` })
      return
    }
    if (!sniffMedia(bytes, ext)) {
      sendJson(res, 400, { ok: false, error: '文件内容与扩展名不匹配' })
      return
    }
    const id = shortHash(`${fileName}|${ext}|${String(Date.now())}|${String(Math.random())}`)
    const mime = MIME_BY_EXT[ext]
    try {
      mkdirSync(paths.assetsDir, { recursive: true })
      writeFileSync(join(paths.assetsDir, id), bytes)
      const asset = { id, name: fileName, mime, size: bytes.length, createdAt: Date.now() }
      assets.set(id, asset)
      saveAssetIndex()
      stats.assetUploads += 1
      record('assets/uploaded', { id, mime, size: bytes.length })
      scheduleStatusWrite()
      sendJson(res, 200, { ok: true, asset: { ...asset, url: `${ASSET_PREFIX}/${id}` } })
    } catch (error) {
      sendJson(res, 500, { ok: false, error: String(error) })
    }
  }

  /** Serve one uploaded asset by id. */
  const assetHandler = async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' })
      res.end()
      return
    }
    let pathname = '/'
    try {
      pathname = new URL(req.url ?? '/', 'http://dsh.invalid').pathname
    } catch {}
    const id = pathname.slice(ASSET_PREFIX.length + 1)
    if (!/^[a-f0-9]{12}$/u.test(id)) {
      res.writeHead(404)
      res.end()
      return
    }
    const asset = assets.get(id)
    if (asset === undefined) {
      res.writeHead(404)
      res.end()
      return
    }
    try {
      const bytes = readFileSync(join(paths.assetsDir, id))
      res.writeHead(200, {
        'content-type': asset.mime,
        'content-length': String(bytes.length),
        'cache-control': 'no-store, max-age=0',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      })
      if (req.method === 'HEAD') res.end()
      else res.end(bytes)
    } catch {
      res.writeHead(404)
      res.end()
    }
  }

  loadAssets()

  /** Dev-only: inject fake pending reminders to verify the toast size/position. */
  const debugPendingHandler = async (req, res) => {
    if (!debugEnabled()) {
      res.writeHead(404)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' })
      res.end()
      return
    }
    const parsed = await readJsonBody(req, MAX_JSON_BYTES)
    if (parsed.tooLarge) {
      sendJson(res, 413, { ok: false, error: 'body too large' })
      return
    }
    const body = parsed.value !== null && typeof parsed.value === 'object' ? parsed.value : {}
    const count = Math.max(1, Math.min(20, Number.isFinite(body.count) ? Math.trunc(body.count) : 1))
    const kind = body.kind === 'question' ? 'question' : 'approval'
    const reason = typeof body.reason === 'string' && body.reason.length > 0
      ? body.reason.slice(0, 180)
      : '调试提醒：验证右下角卡片尺寸与逐条弹出（不会真的确认任何东西）'
    const stage = Number.isFinite(body.stage) ? Math.max(0, Math.min(5, Math.trunc(body.stage))) : 0
    const base = Date.now()
    const stamp = base.toString(36)
    const ids = []
    for (let index = 0; index < count; index += 1) {
      const id = `debug:${String(base)}:${String(index)}`
      ids.push(id)
      pending.set(id, {
        id,
        kind,
        at: base + index * 2000,
        stage,
        // Each injected reminder is a distinct pending interaction: unique
        // session/call ids so the browser half never dedupes them into one card.
        sessionId: `debug-session-${stamp}-${String(index + 1)}`,
        toolName: kind === 'approval' ? 'debug' : 'ask_user_question',
        reason,
        header: undefined,
        questionCount: kind === 'question' ? 1 : undefined,
        callId: `debug-call-${stamp}-${String(index + 1)}`,
      })
    }
    record('debug/pending', { count, kind })
    scheduleStatusWrite()
    sendJson(res, 200, { ok: true, ids, pendingCount: pending.size })
  }

  /** Dev-only: clear the fake pending reminders. */
  const debugClearHandler = async (req, res) => {
    if (!debugEnabled()) {
      res.writeHead(404)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' })
      res.end()
      return
    }
    let removed = 0
    for (const id of [...pending.keys()]) {
      if (!id.startsWith('debug:')) continue
      pending.delete(id)
      removed += 1
    }
    record('debug/clear', { removed })
    scheduleStatusWrite()
    sendJson(res, 200, { ok: true, removed, pendingCount: pending.size })
  }

  // Prepend: record the request while it is pending, then pass the chain on.
  ctx.on('approval/request', (request, next) => observe('approval', request, next), true)
  ctx.on('user-questions/request', (request, next) => observe('question', request, next), true)
  record('observer/approval')
  record('observer/question')

  ctx.inject(['webServer'], (scope) => {
    const webServer = scope.webServer
    const disposers = [
      webServer.register({ kind: 'exact', path: PENDING_ROUTE, handler: pendingHandler }),
      webServer.register({ kind: 'exact', path: ACK_ROUTE, handler: ackHandler }),
      webServer.register({ kind: 'exact', path: ASSETS_ROUTE, handler: assetsHandler }),
      webServer.register({ kind: 'prefix', path: ASSET_PREFIX, handler: assetHandler }),
      webServer.register({ kind: 'exact', path: DEBUG_PENDING_ROUTE, handler: debugPendingHandler }),
      webServer.register({ kind: 'exact', path: DEBUG_CLEAR_ROUTE, handler: debugClearHandler }),
    ]
    record('server/routes', { routes: [PENDING_ROUTE, ACK_ROUTE, ASSETS_ROUTE, `${ASSET_PREFIX}/<id>`, DEBUG_PENDING_ROUTE, DEBUG_CLEAR_ROUTE] })
    scheduleStatusWrite()
    scope.effect(() => () => {
      for (const dispose of disposers) dispose()
    }, 'approval-notifier: routes')
  })

  const heartbeat = setInterval(() => {
    if (!debugEnabled()) return
    if (Date.now() - lastStatusAt >= 5000) scheduleStatusWrite()
  }, 5000)
  if (typeof heartbeat.unref === 'function') heartbeat.unref()

  ctx.effect(() => () => {
    disposed = true
    clearInterval(heartbeat)
    if (writeTimer !== undefined) {
      clearTimeout(writeTimer)
      writeTimer = undefined
    }
    pending.clear()
    if (debugEnabled()) {
      record('host/disposed')
      writeStatusNow()
    }
    logger.info?.('disposed after %d approval / %d question request(s)', stats.approvalRequests, stats.questionRequests)
  }, 'approval-notifier: heartbeat + teardown')

  record('host/started', {
    version: packageVersion,
    brand: currentSettings().brand,
    debug: debugEnabled(),
  })
  scheduleStatusWrite()
  logger.info?.('Sentinel observing waterfalls (debug status: %s)', debugEnabled() ? paths.statusFile : 'off')
}
