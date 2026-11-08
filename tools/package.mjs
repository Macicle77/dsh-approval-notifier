/**
 * Build a publish-ready npm tarball for the plugin market.
 *
 * Steps: validate the bundle manifest → run the self-test → pack the whitelisted
 * files (npm pack when npm is available, otherwise a `package/` tar.gz built
 * with the system tar) → print the artifact path, size and SHA-256.
 *
 * Usage: node tools/package.mjs
 */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const DIST = join(ROOT, 'dist')
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const failures = []

function check(condition, label) {
  if (condition) return
  failures.push(label)
  process.stderr.write(`FAIL: ${label}\n`)
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function main() {
  check(manifest.name === 'dsh-approval-notifier', 'package name')
  check(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(manifest.version), 'semver version')
  check(typeof manifest.description === 'string' && manifest.description.length > 0, 'description')
  check(manifest.license === 'MIT', 'license')
  check(manifest.publishConfig?.access === 'public', 'publishConfig access')
  check(typeof manifest.engines?.dsh === 'string', 'engines.dsh')
  check(manifest.dsh?.bundle?.patch === './cordis.patch.yml', 'dsh.bundle.patch')
  check(manifest.dsh?.client?.platform === 'web', 'dsh.client.platform')
  check(Array.isArray(manifest.dsh?.client?.inject) && manifest.dsh.client.inject.length > 0, 'dsh.client.inject')
  check(typeof manifest.icon === 'string' && existsSync(join(ROOT, manifest.icon)), 'icon')
  check(existsSync(join(ROOT, 'cordis.patch.yml')), 'bundle patch file')
  check(existsSync(join(ROOT, 'client', 'client.js')), 'client bundle')
  check(existsSync(join(ROOT, manifest.main ?? 'lib/host.js')), 'host entry')
  check(existsSync(join(ROOT, 'README.md')), 'README')
  check(existsSync(join(ROOT, 'LICENSE')), 'LICENSE')
  check(existsSync(join(ROOT, 'CHANGELOG.md')), 'CHANGELOG')
  for (const locale of ['zh', 'en']) check(existsSync(join(ROOT, 'locale', `${locale}.json`)), `locale/${locale}.json`)

  if (failures.length > 0) {
    process.stderr.write(`packaging refused: ${String(failures.length)} failed check(s)\n`)
    process.exitCode = 1
    return
  }

  const selftest = spawnSync(process.execPath, [join(ROOT, 'selftest.mjs')], { cwd: ROOT, stdio: 'inherit' })
  if (selftest.status !== 0) {
    process.stderr.write('packaging refused: selftest failed\n')
    process.exitCode = 1
    return
  }

  mkdirSync(DIST, { recursive: true })
  const artifact = join(DIST, `${manifest.name}-${manifest.version}.tgz`)
  rmSync(artifact, { force: true })

  let packedBy = 'tar'
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const npm = spawnSync(npmCommand, ['pack', '--pack-destination', DIST], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' })
  const npmOk = npm.status === 0 && existsSync(artifact)
  if (npmOk) {
    packedBy = 'npm'
  } else {
    // Fallback: build an npm-compatible tarball with a package/ root.
    const staging = mkdtempSync(join(tmpdir(), 'sentinel-pack-'))
    const packageDir = join(staging, 'package')
    mkdirSync(packageDir, { recursive: true })
    const copyRecursive = (source, destination) => {
      for (const entry of readdirSync(source, { withFileTypes: true })) {
        const from = join(source, entry.name)
        const to = join(destination, entry.name)
        if (entry.isDirectory()) {
          mkdirSync(to, { recursive: true })
          copyRecursive(from, to)
        } else {
          copyFileSync(from, to)
        }
      }
    }
    for (const entry of manifest.files ?? []) {
      const source = join(ROOT, entry)
      if (!existsSync(source)) continue
      if (statSync(source).isDirectory()) {
        mkdirSync(join(packageDir, entry), { recursive: true })
        copyRecursive(source, join(packageDir, entry))
      } else {
        mkdirSync(dirname(join(packageDir, entry)), { recursive: true })
        copyFileSync(source, join(packageDir, entry))
      }
    }
    copyFileSync(join(ROOT, 'package.json'), join(packageDir, 'package.json'))
    const tar = spawnSync('tar', ['-czf', artifact, '-C', staging, 'package'], { encoding: 'utf8', shell: false })
    rmSync(staging, { recursive: true, force: true })
    if (tar.status !== 0 || !existsSync(artifact)) {
      process.stderr.write(`packaging failed: npm and tar both failed\n${String(tar.stderr ?? '')}\n${String(npm.stderr ?? '')}\n`)
      process.exitCode = 1
      return
    }
  }

  const listing = spawnSync('tar', ['-tzf', artifact], { encoding: 'utf8', shell: false })
  const entries = listing.status === 0
    ? listing.stdout.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0)
    : []
  const hasPackageJson = entries.some((entry) => entry === 'package/package.json')
  const hasClient = entries.some((entry) => entry === 'package/client/client.js')
  const hasHost = entries.some((entry) => entry === `package/${manifest.main ?? 'lib/host.js'}`)
  const hasPatch = entries.some((entry) => entry === 'package/cordis.patch.yml')
  const hasTools = entries.some((entry) => entry.startsWith('package/tools/'))
  const hasSelftest = entries.some((entry) => entry.includes('selftest.mjs'))
  if (!hasPackageJson || !hasClient || !hasHost || !hasPatch) {
    process.stderr.write('packaging failed: tarball is missing required files\n')
    process.exitCode = 1
    return
  }
  if (hasTools || hasSelftest) process.stderr.write('warning: tarball includes development files (tools/selftest)\n')

  const size = statSync(artifact).size
  process.stdout.write(`${JSON.stringify({
    ok: true,
    artifact,
    relative: relative(ROOT, artifact),
    packedBy,
    version: manifest.version,
    size,
    sha256: sha256(artifact),
    entries: entries.length,
    install: {
      local: 'Plugins -> Add plugin -> absolute path of the tarball',
      published: `Plugins -> Add plugin -> ${manifest.name}`,
    },
  }, undefined, 2)}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`package failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
}
