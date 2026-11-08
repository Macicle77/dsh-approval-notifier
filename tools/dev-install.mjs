/**
 * Developer-only installer: puts the bundle into the desktop profile the SAME
 * way the official Plugins page would (profile dependency + `dsh.profile.bundles`
 * selection), then removes the legacy hand-installed traces (plugins copy,
 * node_modules junction, manual patch insert) and optionally enables the
 * opt-in debug status file.
 *
 * End users install through Plugins → Add plugin (absolute path, tarball, or
 * the published package name) — NOT through this script.
 *
 * Usage:
 *   node tools/dev-install.mjs [--profile desktop] [--debug]
 */

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const NAME = PACKAGE.name
const PROFILE_DEPS_SPEC = `file:./plugins/${NAME}`

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

/** Copy every entry listed in package.json "files" (dirs recursively) plus the manifest itself. */
function copyPackage(destination) {
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })
  for (const entry of PACKAGE.files ?? []) {
    const source = join(ROOT, entry)
    if (!existsSync(source)) continue
    cpSync(source, join(destination, entry), { recursive: true })
  }
  copyFileSync(join(ROOT, 'package.json'), join(destination, 'package.json'))
}

/**
 * Remove the legacy hand-install insert block (`- insert:` with our row) and
 * optionally maintain a top-level `- id: <name>` config override.
 * @returns {{ removedLegacy: boolean, override: 'added' | 'removed' | 'kept' | 'none' }} bookkeeping.
 */
function patchProfile(profileDir, debug) {
  const patchPath = join(profileDir, 'cordis.patch.yml')
  let text = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  let lines = text.split('\n')
  let removedLegacy = false

  // 1. Remove a legacy manual insert block that inserted this row directly.
  const idIndex = lines.findIndex((line) => line.includes(`id: ${NAME}`))
  if (idIndex !== -1) {
    let from = idIndex
    while (from > 0 && !lines[from].trim().startsWith('- insert:')) from -= 1
    if (lines[from].trim().startsWith('- insert:')) {
      if (from > 0 && lines[from - 1].startsWith('#')) from -= 1
      let to = idIndex
      while (to + 1 < lines.length && (lines[to + 1].startsWith(' ') || lines[to + 1].startsWith('\t') || lines[to + 1].trim() === '')) to += 1
      lines.splice(from, to - from + 1)
      removedLegacy = true
    }
  }

  // 2. Maintain the top-level `- id: <name>` dev override (debug + an explicit
  // brand so an HMR entry update restarts the row with a fresh module URL).
  let overrideIndex = lines.findIndex((line) => line.trim() === `- id: ${NAME}`)
  let overrideChanged = false
  if (overrideIndex !== -1 && debug !== true) {
    let to = overrideIndex
    while (to + 1 < lines.length && !(lines[to + 1].startsWith('- ') && !lines[to + 1].startsWith('  '))) to += 1
    lines.splice(overrideIndex, to - overrideIndex + 1)
    overrideChanged = true
    overrideIndex = -1
  } else if (overrideIndex !== -1 && debug === true) {
    let to = overrideIndex
    while (to + 1 < lines.length && !(lines[to + 1].startsWith('- ') && !lines[to + 1].startsWith('  '))) to += 1
    lines.splice(overrideIndex, to - overrideIndex + 1)
    overrideIndex = -1
    overrideChanged = true
  }
  if (debug === true && overrideIndex === -1) {
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
    lines.push('', `- id: ${NAME}`, '  config:', '    debug: true', '    brand: 哨兵', '')
    overrideChanged = true
  }

  if (removedLegacy || overrideChanged) {
    atomicWrite(`${patchPath}.bak-${String(Date.now())}`, text)
    atomicWrite(patchPath, `${lines.join('\n').replace(/\n{3,}/gu, '\n\n')}\n`)
  }
  return {
    removedLegacy,
    override: debug === true ? (overrideIndex === -1 ? 'added' : 'kept') : overrideIndex === -1 ? 'none' : 'removed',
  }
}

function main() {
  const flags = parseArgs(process.argv.slice(2))
  const profileName = flags.profile !== undefined && flags.profile !== 'true' ? flags.profile : 'desktop'
  const profileDir = join(dshHome(), 'profiles', profileName)
  const manifestPath = join(profileDir, 'package.json')
  if (!existsSync(manifestPath)) throw new Error(`profile not found: ${profileDir}`)

  const pluginsDir = join(profileDir, 'plugins')
  const pluginDir = join(pluginsDir, NAME)
  const nodeModulesDir = join(profileDir, 'node_modules')
  const linkPath = join(nodeModulesDir, NAME)
  mkdirSync(pluginsDir, { recursive: true })
  mkdirSync(nodeModulesDir, { recursive: true })

  copyPackage(pluginDir)

  rmSync(linkPath, { recursive: true, force: true })
  let linked = 'junction'
  try {
    symlinkSync(pluginDir, linkPath, 'junction')
  } catch (_error) {
    linked = 'copy'
    copyPackage(linkPath)
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const dependencies = { ...(manifest.dependencies ?? {}), [NAME]: PROFILE_DEPS_SPEC }
  const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? [...manifest.dsh.profile.bundles] : []
  const alreadySelected = bundles.includes(NAME)
  if (!alreadySelected) bundles.push(NAME)
  const nextManifest = {
    ...manifest,
    dependencies,
    dsh: {
      ...manifest.dsh,
      profile: { ...manifest.dsh?.profile, bundles },
    },
  }
  const manifestChanged = JSON.stringify(manifest) !== JSON.stringify(nextManifest)
  if (manifestChanged) {
    atomicWrite(`${manifestPath}.bak-${String(Date.now())}`, JSON.stringify(manifest, undefined, 2) + '\n')
    atomicWrite(manifestPath, JSON.stringify(nextManifest, undefined, 2) + '\n')
  }

  const patch = patchProfile(profileDir, flags.debug === 'true')

  process.stdout.write(`${JSON.stringify({
    ok: true,
    devOnly: true,
    note: 'End users install through Plugins -> Add plugin; this script only mirrors what the manager writes for local development.',
    profile: profileName,
    profileDir,
    pluginDir,
    nodeModulesEntry: linkPath,
    linked,
    dependency: PROFILE_DEPS_SPEC,
    bundleSelected: bundles.includes(NAME),
    bundleWasSelected: alreadySelected,
    manifestChanged,
    patch,
    debug: flags.debug === 'true',
  }, undefined, 2)}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`dev-install failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
}
