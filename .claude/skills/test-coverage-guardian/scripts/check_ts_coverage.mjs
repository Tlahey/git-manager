#!/usr/bin/env node
// Reports per-file coverage (lines/branches/functions/statements) for specific TS/TSX source
// files, scoped to the test files that actually exercise them (via `vitest related`, which
// resolves the module graph — not a filename guess, so it doesn't care what the test is named
// or where it lives) rather than a full-repo coverage run.
//
// Usage: node check_ts_coverage.mjs <path/to/Source.ts> [<path/to/Source2.tsx> ...]
// Paths may be absolute or relative to the current working directory.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const THRESHOLD = 95

function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
}

function pctLine(label, pct) {
  const ok = pct >= THRESHOLD
  return `  ${ok ? 'OK  ' : 'FAIL'}  ${label.padEnd(10)} ${pct.toFixed(2)}%`
}

function compressRanges(nums) {
  const sorted = [...new Set(nums)].sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const ranges = []
  let start = sorted[0]
  let prev = sorted[0]
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) {
      prev = n
      continue
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
    start = prev = n
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
  return ranges.join(',')
}

// coverage-final.json uses istanbul's shape: statementMap/s, branchMap/b, fnMap/f — each map
// gives a source location per id, each sibling counter object gives hit counts per id (branches
// have one count per possible path, so "uncovered" means every path in that branch has 0 hits).
function uncoveredDetail(fileEntry) {
  const uncoveredLines = Object.entries(fileEntry.statementMap)
    .filter(([id]) => fileEntry.s[id] === 0)
    .map(([, loc]) => loc.start.line)

  const uncoveredBranchLines = Object.entries(fileEntry.branchMap)
    .filter(([id]) => (fileEntry.b[id] ?? []).every((count) => count === 0))
    .map(([, branch]) => branch.loc?.start.line ?? branch.locations?.[0]?.start.line)
    .filter((line) => line !== undefined)

  const uncoveredFunctions = Object.entries(fileEntry.fnMap)
    .filter(([id]) => fileEntry.f[id] === 0)
    .map(([, fn]) => fn.name || `<anonymous at line ${fn.decl?.start.line ?? fn.loc?.start.line}>`)

  return { uncoveredLines, uncoveredBranchLines, uncoveredFunctions }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: node check_ts_coverage.mjs <path/to/Source.ts> [...]')
    process.exit(1)
  }

  const root = repoRoot()
  const desktopDir = path.join(root, 'apps/desktop')
  const sources = args.map((a) => path.resolve(process.cwd(), a))
  const relSources = sources.map((s) => path.relative(desktopDir, s))

  console.log(`Finding and running tests related to: ${relSources.join(', ')}`)
  console.log()

  let stdout = ''
  let failed = false
  try {
    stdout = execFileSync(
      'pnpm',
      [
        'exec',
        'vitest',
        'related',
        ...relSources,
        '--coverage',
        '--coverage.reporter=json-summary',
        '--coverage.reporter=json',
      ],
      { cwd: desktopDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
  } catch (err) {
    // vitest exits non-zero on test failures too — still try to read the coverage report below,
    // since it's written even when some assertion failed, and the numbers are still useful.
    stdout = (err.stdout ?? '') + (err.stderr ?? '')
    failed = true
  }
  console.log(stdout)
  if (failed) {
    console.log('vitest reported test failures — fix those first, the coverage numbers below are not trustworthy until they pass.\n')
  }

  const summaryPath = path.join(desktopDir, 'coverage', 'coverage-summary.json')
  const finalPath = path.join(desktopDir, 'coverage', 'coverage-final.json')
  if (!existsSync(summaryPath) || !existsSync(finalPath)) {
    console.error(
      `error: coverage report was not produced at ${path.dirname(summaryPath)} — is the coverage block set up in vite.config.ts? Run setup_coverage_tooling.sh.`,
    )
    process.exit(1)
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
  const final = JSON.parse(readFileSync(finalPath, 'utf8'))

  let allPass = !failed
  for (const src of sources) {
    const rel = path.relative(root, src)
    console.log(rel)
    if (!summary[src]) {
      console.log('  (no coverage data — no related test exercises this file yet; write one first)')
      allPass = false
      console.log()
      continue
    }
    const entry = summary[src]
    const metrics = ['lines', 'branches', 'functions', 'statements']
    for (const m of metrics) {
      const pct = entry[m].pct
      if (pct < THRESHOLD) allPass = false
      console.log(pctLine(m, pct))
    }

    const detail = final[src] ? uncoveredDetail(final[src]) : null
    if (detail) {
      const lineRanges = compressRanges(detail.uncoveredLines)
      if (lineRanges) console.log(`  uncovered line #s: ${lineRanges}`)
      const branchRanges = compressRanges(detail.uncoveredBranchLines)
      if (branchRanges) console.log(`  uncovered branch at line #s: ${branchRanges}`)
      if (detail.uncoveredFunctions.length > 0) {
        console.log(`  uncovered functions: ${detail.uncoveredFunctions.join(', ')}`)
      }
    }
    console.log()
  }

  if (!allPass) {
    console.log(`Below ${THRESHOLD}% on at least one metric for at least one file (or tests are failing) — add tests targeting the uncovered lines/branches/functions above and rerun.`)
    process.exit(1)
  }
  console.log(`All files at or above ${THRESHOLD}% on lines, branches, functions, and statements.`)
}

main()
