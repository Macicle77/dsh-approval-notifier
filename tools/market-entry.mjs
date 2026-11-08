/**
 * Generate the draft plugin-market index entry (format 1) for this bundle.
 *
 * The entry is what a market index (awesome-dsh-plugin / dsh-family catalogs)
 * lists: localized title/description/icon, author/homepage, metadata and the
 * exact npm source per version. Run it again after bumping the version or after
 * the npm publish timestamp is known.
 *
 * Usage: node tools/market-entry.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const zh = JSON.parse(readFileSync(join(ROOT, 'locale', 'zh.json'), 'utf8'))
const en = JSON.parse(readFileSync(join(ROOT, 'locale', 'en.json'), 'utf8'))

const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u
const failures = []

function check(condition, label) {
  if (condition) return
  failures.push(label)
  process.stderr.write(`FAIL: ${label}\n`)
}

function iconDataUrl() {
  const svg = readFileSync(join(ROOT, manifest.icon ?? 'icon.svg'))
  const payload = svg.toString('base64')
  return `data:image/svg+xml;base64,${payload}`
}

function main() {
  check(typeof manifest.name === 'string' && /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u.test(manifest.name), 'npm package name')
  check(SEMVER.test(manifest.version), 'exact semver version')
  check(typeof manifest.engines?.dsh === 'string', 'engines.dsh range')
  check(typeof en.meta?.title === 'string' && typeof zh.meta?.title === 'string', 'localized titles')
  check(existsSync(join(ROOT, 'README.md')), 'README present')

  if (failures.length > 0) {
    process.stderr.write(`market entry refused: ${String(failures.length)} failed check(s)\n`)
    process.exitCode = 1
    return
  }

  const entry = {
    format: 1,
    title: {
      en: 'Sentinel — Confirmation reminders for DeepSeek Harness',
      zh: '哨兵 — DeepSeek Harness 确认提醒',
    },
    description: {
      en: 'Pops one compact reminder card per pending confirmation in any workspace/session, with configurable animation and sound. Only reminds — never answers for you.',
      zh: '任意工作区/会话需要确认时，在右下角逐条提醒；可配置动画与提示音，点击去处理后左下角反馈“正在处理”。只提醒，绝不替用户做决定。',
    },
    metadata: {
      categories: {
        'confirmation-reminders': {
          title: { en: 'Confirmation reminders', zh: '确认提醒' },
        },
      },
      labels: {},
      sortKeys: {},
    },
    plugins: [
      {
        name: manifest.name,
        title: en.meta.title,
        description: en.meta.description,
        icon: iconDataUrl(),
        author: typeof manifest.author === 'string' ? manifest.author : 'Sentinel Contributors',
        homepage: 'https://www.npmjs.com/package/dsh-approval-notifier',
        metadata: {
          category: 'confirmation-reminders',
          keywords: Array.isArray(manifest.keywords) ? manifest.keywords : [],
          labels: [],
          sortKeys: {},
        },
        versions: [
          {
            version: manifest.version,
            // Replaced with the real Unix-seconds publish time after `npm publish`.
            publishTimestamp: Math.floor(Date.now() / 1000),
            source: { type: 'npm' },
            engines: { dsh: manifest.engines.dsh },
          },
        ],
      },
    ],
  }

  const target = join(ROOT, 'market', 'index-entry.json')
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${JSON.stringify(entry, undefined, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify({
    ok: true,
    target,
    plugin: manifest.name,
    version: manifest.version,
    note: 'Draft index entry. After npm publish, set plugins[0].versions[0].publishTimestamp to the real publish time.',
  }, undefined, 2)}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`market-entry failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
}
