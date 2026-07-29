import { describe, it, expect } from 'vitest'
import {
  buildUpgradeRiskPrompt,
  parseUpgradeRisk,
  upgradeRiskFeature,
  type UpgradeRiskInput,
} from './upgradeRisk'

function input(overrides: Partial<UpgradeRiskInput> = {}): UpgradeRiskInput {
  return {
    package: 'react',
    from: '18.2.0',
    to: '19.0.0',
    changelog: '## Breaking\n- `ReactDOM.render` is removed.',
    changelogMatched: true,
    usage: {
      fileCount: 12,
      files: ['src/main.tsx', 'src/App.tsx'],
      symbols: ['useState', 'useEffect'],
      subpaths: [],
      defaultImport: true,
      namespaceImport: false,
      samples: [{ path: 'src/App.tsx', line: 1, text: "import { useState } from 'react'" }],
    },
    ...overrides,
  }
}

const answer = (body: Record<string, unknown>) => JSON.stringify(body)

describe('buildUpgradeRiskPrompt', () => {
  it('gives the model the usage, not just the notes', () => {
    const prompt = buildUpgradeRiskPrompt(input())

    expect(prompt).toContain('react')
    expect(prompt).toContain('18.2.0 → 19.0.0')
    expect(prompt).toContain('Imported in 12 file(s).')
    expect(prompt).toContain('useState, useEffect')
    expect(prompt).toContain("import { useState } from 'react'")
    expect(prompt).toContain('ReactDOM.render')
  })

  /** The symbol list stops being exhaustive, and the verdict must not lean on it. */
  it('calls out a namespace import', () => {
    const prompt = buildUpgradeRiskPrompt(
      input({ usage: { ...input().usage, namespaceImport: true } })
    )
    expect(prompt).toContain('namespace import')
  })

  it('lists the entry points in use', () => {
    const prompt = buildUpgradeRiskPrompt(
      input({ usage: { ...input().usage, subpaths: ['react-dom/client'] } })
    )
    expect(prompt).toContain('Entry points used: react-dom/client')
  })

  it('says plainly when there are no notes rather than sending an empty block', () => {
    const prompt = buildUpgradeRiskPrompt(input({ changelog: '   ' }))
    expect(prompt).toContain('no release notes were found')
  })

  /** Recent-but-unrelated notes would otherwise be judged as if they were the range. */
  it('warns the model when the notes could not be matched to the range', () => {
    const prompt = buildUpgradeRiskPrompt(input({ changelogMatched: false }))
    expect(prompt).toContain('could not be matched to the version range')
  })

  /**
   * A big major's notes run to tens of thousands of characters and would otherwise
   * push the usage — the part that makes the answer specific — out of the window.
   */
  it('truncates oversized notes instead of dropping the usage', () => {
    const huge = 'x'.repeat(400_000)
    const prompt = buildUpgradeRiskPrompt(input({ changelog: huge, contextTokens: 8000 }))

    expect(prompt).toContain('notes truncated')
    expect(prompt.length).toBeLessThan(huge.length)
    expect(prompt).toContain('Imported in 12 file(s).')
  })
})

describe('parseUpgradeRisk', () => {
  it('reads a well-formed verdict', () => {
    const result = parseUpgradeRisk(
      answer({
        changes: [
          {
            change: 'ReactDOM.render removed',
            affectsUs: true,
            where: ['src/main.tsx'],
            note: 'You call render here.',
          },
        ],
        risk: 'high',
        summary: 'Migrate to createRoot.',
      }),
      ['src/main.tsx', 'src/App.tsx']
    )

    expect(result.risk).toBe('high')
    expect(result.summary).toBe('Migrate to createRoot.')
    expect(result.changes).toHaveLength(1)
    expect(result.changes[0].where).toEqual(['src/main.tsx'])
  })

  /** A path that isn't ours would render as a location to go and check that doesn't exist. */
  it('drops paths that were not in the file list', () => {
    const result = parseUpgradeRisk(
      answer({
        changes: [
          {
            change: 'x',
            affectsUs: true,
            where: ['src/main.tsx', 'src/invented.tsx'],
            note: '',
          },
        ],
        risk: 'medium',
        summary: '',
      }),
      ['src/main.tsx']
    )

    expect(result.changes[0].where).toEqual(['src/main.tsx'])
  })

  it('carries no locations on a change it says does not apply', () => {
    const result = parseUpgradeRisk(
      answer({
        changes: [{ change: 'x', affectsUs: false, where: ['src/main.tsx'], note: 'Not used.' }],
        risk: 'low',
        summary: '',
      }),
      ['src/main.tsx']
    )

    expect(result.changes[0].where).toEqual([])
  })

  /** A verdict with nothing behind it is a mood, not a conclusion. */
  it('lowers a scary verdict that no listed change supports', () => {
    const result = parseUpgradeRisk(
      answer({
        changes: [{ change: 'x', affectsUs: false, where: [], note: '' }],
        risk: 'high',
        summary: '',
      })
    )

    expect(result.risk).toBe('low')
  })

  /** The clamp is one-way: an affecting change is never allowed to read as safe. */
  it('raises a reassuring verdict that contradicts its own changes', () => {
    for (const claimed of ['low', 'unknown']) {
      const result = parseUpgradeRisk(
        answer({
          changes: [{ change: 'x', affectsUs: true, where: [], note: '' }],
          risk: claimed,
          summary: '',
        })
      )
      expect(result.risk).toBe('medium')
    }
  })

  it('keeps a high verdict backed by an affecting change', () => {
    const result = parseUpgradeRisk(
      answer({
        changes: [{ change: 'x', affectsUs: true, where: [], note: '' }],
        risk: 'high',
        summary: '',
      })
    )
    expect(result.risk).toBe('high')
  })

  it('reports unknown when there is nothing readable, rather than a reassuring default', () => {
    for (const raw of ['', 'the model rambled', '{ not json']) {
      expect(parseUpgradeRisk(raw)).toEqual({ risk: 'unknown', summary: '', changes: [] })
    }
  })

  it('drops a change with no text and ignores an unrecognised risk level', () => {
    const result = parseUpgradeRisk(
      answer({
        changes: [{ change: '  ', affectsUs: true, where: [], note: 'x' }],
        risk: 'catastrophic',
        summary: 'hm',
      })
    )

    expect(result.changes).toEqual([])
    expect(result.risk).toBe('unknown')
  })

  it('tolerates a stringified boolean from a loose schema', () => {
    const result = parseUpgradeRisk(
      answer({
        changes: [{ change: 'x', affectsUs: 'true', where: [], note: '' }],
        risk: 'medium',
        summary: '',
      })
    )
    expect(result.changes[0].affectsUs).toBe(true)
  })
})

describe('upgradeRiskFeature', () => {
  const shape = upgradeRiskFeature.schema?.schema as {
    required: string[]
    properties: Record<string, unknown>
  }

  it('is a low-temperature completion constrained to the three fields', () => {
    expect(upgradeRiskFeature.kind).toBe('completion')
    expect(upgradeRiskFeature.temperature).toBeLessThanOrEqual(0.2)
    expect(shape.required).toEqual(['changes', 'risk', 'summary'])
  })

  /** Evidence before verdict: the same ordering lesson as the commit relevance feature. */
  it('generates the enumerated changes before the overall risk', () => {
    const properties = Object.keys(shape.properties)
    expect(properties.indexOf('changes')).toBeLessThan(properties.indexOf('risk'))
  })

  /** The interactive budget killed a real run; this feature opts out of it entirely. */
  it('runs without a timeout, because a big changelog legitimately takes minutes', () => {
    expect(upgradeRiskFeature.timeoutSeconds).toBe(0)
  })

  it('forbids summarising the release and demands repo-specific reasoning', () => {
    expect(upgradeRiskFeature.instruction).toContain('Do NOT summarise the release notes')
    expect(upgradeRiskFeature.instruction).toContain('IMPORT SITES ONLY')
  })
})
