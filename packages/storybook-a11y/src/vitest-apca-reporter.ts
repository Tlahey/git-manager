import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Reporter } from 'vitest/node'
import type { RunnerTask, RunnerTestFile } from 'vitest'
import type { ApcaCellMeta, ApcaTaskMeta, ViolationNodeRecord } from './apca-report-types'

// NODE-side custom Vitest reporter for the APCA matrix (vitest.apca.config.ts adds it
// next to the default reporter). The browser-side tests (matrix.tsx) attach their
// structured results to task.meta; this collects them and writes a comparable
// theme × surface report:
//   <outputDir>/apca-report.json — machine-readable, one entry per cell
//   <outputDir>/apca-report.md   — failing-node counts as a theme × surface table,
//                                  plus per-cell node details
// Import from "@git-manager/storybook-a11y/vitest-apca-reporter" in a vitest config
// only — this entry uses node:fs and must never be pulled into browser/preview code.

export interface ApcaMatrixReporterOptions {
  /** Directory (relative to the vitest cwd) the report files are written to. */
  outputDir?: string
}

export class ApcaMatrixReporter implements Reporter {
  private readonly outputDir: string

  constructor(options: ApcaMatrixReporterOptions = {}) {
    this.outputDir = options.outputDir ?? 'a11y-report'
  }

  onFinished(files: RunnerTestFile[] = []): void {
    const cells: ApcaCellMeta[] = []
    const walk = (task: RunnerTask): void => {
      const { apca } = task.meta as ApcaTaskMeta
      if (task.type === 'test' && apca) cells.push(apca)
      if ('tasks' in task) task.tasks.forEach(walk)
    }
    files.forEach((f) => f.tasks.forEach(walk))
    if (cells.length === 0) return

    const themes = [...new Set(cells.map((c) => c.theme))]
    const surfaces = [...new Set(cells.map((c) => c.surface))]
    const byKey = new Map(cells.map((c) => [`${c.theme}|${c.surface}`, c]))
    const enforcedCount = (c: ApcaCellMeta): number => c.violations.filter((v) => !v.exempt).length
    const failing = cells.filter((c) => enforcedCount(c) > 0)
    const totalNodes = cells.reduce((sum, c) => sum + enforcedCount(c), 0)
    const totalExempt = cells.reduce((sum, c) => sum + c.violations.filter((v) => v.exempt).length, 0)

    const dir = resolve(process.cwd(), this.outputDir)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      resolve(dir, 'apca-report.json'),
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          totals: { cells: cells.length, failingCells: failing.length, failingNodes: totalNodes, exemptNodes: totalExempt },
          themes,
          surfaces,
          cells: cells.map((c) => ({ ...c, violationCount: c.violations.length })),
        },
        null,
        2,
      )}\n`,
    )
    writeFileSync(resolve(dir, 'apca-report.md'), this.renderMarkdown(themes, surfaces, byKey, totalExempt))

    // eslint-disable-next-line no-console
    console.log(
      `\nAPCA matrix: ${failing.length}/${cells.length} theme × surface cells failing ` +
        `(${totalNodes} enforced nodes, ${totalExempt} exempt by muted-decorative policy) ` +
        `— report written to ${this.outputDir}/apca-report.{json,md}`,
    )
  }

  private renderMarkdown(
    themes: string[],
    surfaces: string[],
    byKey: Map<string, ApcaCellMeta>,
    totalExempt: number,
  ): string {
    const enforced = (theme: string, surface: string): ViolationNodeRecord[] =>
      byKey.get(`${theme}|${surface}`)?.violations.filter((v) => !v.exempt) ?? []
    const lines: string[] = [
      '# APCA Bronze — theme × surface report',
      '',
      `Generated ${new Date().toISOString()} by \`pnpm test:apca\`. Each cell is the`,
      'number of nodes failing APCA Bronze (apca-check) for that theme rendered on that',
      'surface; `✓` means the cell is clean. Intentionally-muted decorative text is',
      'exempt by policy and not counted here (see the note below the table).',
      '',
      `| theme \\ surface | ${surfaces.join(' | ')} | total |`,
      `| --- | ${surfaces.map(() => '---:').join(' | ')} | ---: |`,
    ]
    for (const theme of themes) {
      const counts = surfaces.map((s) => enforced(theme, s).length)
      const total = counts.reduce((a, b) => a + b, 0)
      lines.push(
        `| ${theme} | ${counts.map((c) => (c === 0 ? '✓' : String(c))).join(' | ')} | ${total} |`,
      )
    }
    const surfaceTotals = surfaces.map((s) => themes.reduce((sum, t) => sum + enforced(t, s).length, 0))
    lines.push(`| **total** | ${surfaceTotals.join(' | ')} | ${surfaceTotals.reduce((a, b) => a + b, 0)} |`)

    if (totalExempt > 0) {
      lines.push(
        '',
        `> **${totalExempt} node(s) exempt by the muted-decorative policy** — text in the`,
        '> `muted-foreground` role (inactive Chip, neutral "draft" Tag) is intentionally',
        '> low-contrast and not gated by APCA Bronze. Recorded, not enforced. Actions are',
        '> never muted (the input "Clear" button uses `text-foreground`).',
      )
    }

    lines.push('', '## Failing nodes per cell', '')
    for (const theme of themes) {
      for (const surface of surfaces) {
        const nodes = enforced(theme, surface)
        if (nodes.length === 0) continue
        lines.push(`<details><summary><code>${theme} × ${surface}</code> — ${nodes.length} node(s)</summary>`, '')
        for (const v of nodes) {
          lines.push(`- \`${v.rule}\` — \`${v.target}\` — ${v.message}`)
        }
        lines.push('', '</details>', '')
      }
    }
    return `${lines.join('\n')}\n`
  }
}
