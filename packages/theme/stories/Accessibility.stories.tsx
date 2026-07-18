import type { CSSProperties } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { PARSED_THEMES, RENDERABLE_THEMES } from './_shared'
import {
  CONTRAST_PAIRS,
  COMPONENT_CONTRAST_PAIRS,
  GRAPHICAL_CONTRAST_PAIRS,
  APCA_MIN_UI_TEXT,
  evaluateThemeContrast,
  evaluateComponentContrast,
  evaluateGraphicalContrast,
  evaluateApcaComponentContrast,
  type ThemeTokens,
  type TokenContrastPair,
} from '../src/themeTokens'

// A live accessibility matrix over every theme × every graded pair, driven by the
// same evaluate*() the CI integrity suite asserts. Green = meets its threshold, red
// = fails. This is the always-current answer to "how do we validate theme
// accessibility", across three layers axe alone can't cover:
//   · WCAG 2.x contrast — semantic + Tier-3 component text pairs
//   · WCAG 1.4.11 non-text — a chip/badge FILL vs the surface behind it
//   · APCA (WCAG 3 draft) — perceptual contrast, which flags mid-tone pairs WCAG 2.x
//     rates "AA" but read poorly (e.g. the blue count badge Chrome DevTools flags).
const meta = {
  title: 'Themes/Accessibility report',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

// The minimal shape the table renders — both WCAG (ratio) and APCA (Lc) results
// satisfy it, so one table drives every layer.
interface GradedCell {
  label: string
  value: number | null
  threshold: number
  passes: boolean
}

const cell: CSSProperties = {
  padding: '4px 6px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11,
  textAlign: 'center',
  border: '1px solid #333',
  whiteSpace: 'nowrap',
}

const stickyLeft: CSSProperties = {
  ...cell,
  textAlign: 'left',
  position: 'sticky',
  left: 0,
  background: '#0e0e12',
}

/** One theme's graded row (its label + the per-pair results, pair order fixed). */
interface ThemeRow {
  id: string
  cells: GradedCell[]
}

/** A shared theme × pair matrix. `grade` returns one GradedCell per pair; `format`
 *  renders a value (WCAG ratio → "4.85", APCA → "Lc 78"). */
function ContrastTable({
  heading,
  blurb,
  pairs,
  grade,
  format,
}: {
  heading: string
  blurb: string
  pairs: TokenContrastPair[]
  grade: (tokens: ThemeTokens) => GradedCell[]
  format: (v: number | null) => string
}) {
  const rows: ThemeRow[] = RENDERABLE_THEMES.map((theme) => {
    const tokens = PARSED_THEMES.get(theme.id)
    return { id: theme.id, cells: tokens ? grade(tokens) : [] }
  })
  const totalFailures = rows.reduce((n, r) => n + r.cells.filter((x) => !x.passes).length, 0)

  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ marginTop: 0 }}>{heading}</h3>
      <p style={{ fontSize: 13, color: totalFailures === 0 ? '#7ee787' : '#ff7b72' }}>
        {blurb}{' '}
        {totalFailures === 0
          ? `All ${rows.length} themes pass every graded pair ✓`
          : `${totalFailures} failing pair(s) across ${rows.length} themes`}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={stickyLeft}>theme</th>
              {pairs.map((p) => (
                <th key={p.label} style={cell} title={`min ${p.minRatio}`}>
                  {p.label}
                  <div style={{ opacity: 0.5, fontWeight: 400 }}>≥{p.minRatio}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, cells }) => (
              <tr key={id}>
                <td style={stickyLeft}>{id}</td>
                {cells.map((c) => (
                  <td
                    key={c.label}
                    style={{
                      ...cell,
                      background: c.passes ? 'rgba(46,160,67,0.25)' : 'rgba(248,81,73,0.3)',
                      color: c.passes ? '#7ee787' : '#ffa198',
                    }}
                    title={`${c.label}: ${format(c.value)} (min ${c.threshold})`}
                  >
                    {format(c.value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const page: CSSProperties = {
  padding: 20,
  background: '#0e0e12',
  color: '#e6e6ea',
  minHeight: '100vh',
  fontFamily: 'sans-serif',
}

// WCAG ratio results (ContrastResult) → GradedCell.
const asRatioCells =
  (grade: (t: ThemeTokens) => { label: string; ratio: number | null; minRatio: number; passes: boolean }[]) =>
  (tokens: ThemeTokens): GradedCell[] =>
    grade(tokens).map((r) => ({ label: r.label, value: r.ratio, threshold: r.minRatio, passes: r.passes }))

const ratio = (v: number | null) => (v === null ? 'n/a' : v.toFixed(2))
const lc = (v: number | null) => (v === null ? 'n/a' : `Lc ${Math.round(v)}`)

export const SemanticTokens: Story = {
  render: () => (
    <div style={page}>
      <ContrastTable
        heading="WCAG AA — semantic tokens"
        blurb="Every text-on-surface pair the UI can produce."
        pairs={CONTRAST_PAIRS}
        grade={asRatioCells(evaluateThemeContrast)}
        format={ratio}
      />
    </div>
  ),
}

export const ComponentTokens: Story = {
  render: () => (
    <div style={page}>
      <ContrastTable
        heading="WCAG AA — component tokens (Tier 3)"
        blurb="Per-component fills; a theme may override any of these for a component-specific a11y fix."
        pairs={COMPONENT_CONTRAST_PAIRS}
        grade={asRatioCells(evaluateComponentContrast)}
        format={ratio}
      />
    </div>
  ),
}

export const NonTextContrast: Story = {
  render: () => (
    <div style={page}>
      <ContrastTable
        heading="WCAG 1.4.11 — non-text (graphical) contrast"
        blurb="A solid chip/badge FILL vs the surface behind it (≥3:1). axe's color-contrast rule is text-only, so a badge that blends into the page is invisible to it — graded here instead."
        pairs={GRAPHICAL_CONTRAST_PAIRS}
        grade={asRatioCells(evaluateGraphicalContrast)}
        format={ratio}
      />
    </div>
  ),
}

export const PerceptualApca: Story = {
  render: () => (
    <div style={page}>
      <ContrastTable
        heading={`APCA (WCAG 3 draft) — component labels, |Lc| ≥ ${APCA_MIN_UI_TEXT}`}
        blurb="Perceptual contrast (the algorithm Chrome DevTools reports). Catches labels WCAG 2.x rates AA but that read poorly — mid-blue fills, dark-mode text. Baselined button* fills are the current debt."
        pairs={COMPONENT_CONTRAST_PAIRS.map((p) => ({ ...p, minRatio: APCA_MIN_UI_TEXT }))}
        grade={(tokens) =>
          evaluateApcaComponentContrast(tokens).map((r) => ({
            label: r.label,
            value: r.lc,
            threshold: r.minLc,
            passes: r.passes,
          }))
        }
        format={lc}
      />
    </div>
  ),
}
