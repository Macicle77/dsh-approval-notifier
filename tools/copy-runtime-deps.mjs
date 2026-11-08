/**
 * Development helper: copy a package tree out of the (asar) DSH runtime into a
 * local node_modules so standalone tooling (selftest / package / probe boot)
 * can resolve dependencies the bundle declares. Dev-only; never published.
 *
 * Run with the app's Electron binary in Node mode, e.g.:
 *   ELECTRON_RUN_AS_NODE=1 "D:/DeepSeek/DeepSeek Harness.exe" tools/copy-runtime-deps.mjs
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const RUNTIME = 'D:/DeepSeek/resources/app.asar/dsh/node_modules'
const TARGET = join(ROOT, 'node_modules')

const PACKAGES = [
  '@deepseek-ai/schemastery',
  '@deepseek-ai/cosmokit',
  '@standard-schema/spec',
]

function copyTree(source, destination) {
  const stat = statSync(source)
  if (stat.isDirectory()) {
    mkdirSync(destination, { recursive: true })
    for (const entry of readdirSync(source)) copyTree(join(source, entry), join(destination, entry))
    return
  }
  if (!stat.isFile()) return
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, readFileSync(source))
}

for (const packageName of PACKAGES) {
  const source = join(RUNTIME, packageName)
  const destination = join(TARGET, packageName)
  if (!existsSync(source)) {
    process.stderr.write(`missing in runtime: ${source}\n`)
    continue
  }
  copyTree(source, destination)
  process.stdout.write(`copied ${packageName}\n`)
}
