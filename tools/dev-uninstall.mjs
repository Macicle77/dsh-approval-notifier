/**
 * Developer-only uninstaller: removes exactly the profile wiring this bundle
 * owns (dependency, bundle selection, node_modules entry, plugins copy, debug
 * override, legacy manual insert). End users remove the bundle from the
 * Plugins page instead.
 *
 * Usage: node tools/dev-uninstall.mjs [--profile desktop]
 */

import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const NAME = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name

function parseArgs(argv) {
  const flags = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      flags[token.slice(2)] = 'true'
      continue
    }
    flags[token.slice(2)] = value
    index += 1
  }
  return flags
}

function dshHome() {
  const fromEnv = (process.env.DSH_HOME ?? '').trim()
  return fromEnv.length > 0 ? resolve(fromEnv) : join(homedir(), '.dsh')
}

function atomicWrite(target, content) {
  const temp = `${target}.${String(process.pid)}.tmp`
  writeFileSync(temp, content, 'utf8')
  renameSync(temp, target)
}

function main() {
  const flags = parseArgs(process.argv.slice(2))
  const profileName = flags.profile !== undefined && flags.profile !== 'true' ? flags.profile : 'desktop'
  const profileDir = join(dshHome(), 'profiles', profileName)
  const manifestPath = join(profileDir, 'package.json')
  if (!existsSync(manifestPath)) throw new Error(`profile not found: ${profileDir}`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

  let manifestChanged = false
  if (manifest.dependencies !== undefined && manifest.dependencies[NAME] !== undefined) {
    const next = { ...manifest, dependencies: { ...manifest.dependencies } }
    delete next.dependencies[NAME]
    atomicWrite(`${manifestPath}.bak-${String(Date.now())}`, JSON.stringify(manifest, undefined, 2) + '\n')
    atomicWrite(manifestPath, JSON.stringify(next, undefined, 2) + '\n')
    manifestChanged = true
    Object.assign(manifest, next)
  }

  const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : []
  if (bundles.includes(NAME)) {
    const next = {
      ...manifest,
      dsh: { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: bundles.filter((entry) => entry !== NAME) } },
    }
    atomicWrite(`${manifestPath}.bak-${String(Date.now())}`, JSON.stringify(manifest, undefined, 2) + '\n')
    atomicWrite(manifestPath, JSON.stringify(next, undefined, 2) + '\n')
    manifestChanged = true
  }

  rmSync(join(profileDir, 'node_modules', NAME), { recursive: true, force: true })
  rmSync(join(profileDir, 'plugins', NAME), { recursive: true, force: true })

  const patchPath = join(profileDir, 'cordis.patch.yml')
  if (existsSync(patchPath)) {
    const original = readFileSync(patchPath, 'utf8')
    let lines = original.split('\n')
    // Remove the debug override (`- id: <name>` at top level).
    const overrideIndex = lines.findIndex((line) => line.trim() === `- id: ${NAME}`)
    if (overrideIndex !== -1) {
      let to = overrideIndex
      while (to + 1 < lines.length && !(lines[to + 1].startsWith('- ') && !lines[to + 1].startsWith('  '))) to += 1
      lines.splice(overrideIndex, to - overrideIndex + 1)
    }
    // Remove the legacy manual insert block.
    const idIndex = lines.findIndex((line) => line.includes(`id: ${NAME}`))
    if (idIndex !== -1) {
      let from = idIndex
      while (from > 0 && !lines[from].trim().startsWith('- insert:')) from -= 1
      if (lines[from].trim().startsWith('- insert:')) {
        if (from > 0 && lines[from - 1].startsWith('#')) from -= 1
        let to = idIndex
        while (to + 1 < lines.length && (lines[to + 1].startsWith(' ') || lines[to + 1].startsWith('\t') || lines[to + 1].trim() === '')) to += 1
        lines.splice(from, to - from + 1)
      }
    }
    const next = `${lines.join('\n').replace(/\n{3,}/gu, '\n\n')}\n`
    if (next !== original) {
      atomicWrite(`${patchPath}.bak-${String(Date.now())}`, original)
      atomicWrite(patchPath, next)
    }
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    devOnly: true,
    note: 'End users remove the bundle from the Plugins page instead.',
    profile: profileName,
    profileDir,
    manifestChanged,
  }, undefined, 2)}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`dev-uninstall failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
}
