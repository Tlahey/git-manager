import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { HealthCheck } from '@git-manager/git-types'
import { HealthCheckReport } from './HealthCheckReport'

describe('HealthCheckReport', () => {
  it('explains what a passing check looked for and says there is nothing to report', () => {
    const check: HealthCheck = { id: 'versionAlignment', severity: 'ok', findings: [] }
    render(<HealthCheckReport check={check} />)

    expect(screen.getByText('Version alignment')).toBeInTheDocument()
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByTestId('health-report-clear')).toHaveTextContent(
      'Nothing to report for this check.'
    )
  })

  it('says why a skipped check could not run rather than implying it passed', () => {
    const check: HealthCheck = { id: 'missingInstall', severity: 'skipped', findings: [] }
    render(<HealthCheckReport check={check} />)

    expect(screen.getByText('Not run')).toBeInTheDocument()
    expect(screen.getByTestId('health-report-skipped')).toHaveTextContent(
      'Dependencies are not installed — run install to enable this check.'
    )
    expect(screen.queryByTestId('health-report-clear')).not.toBeInTheDocument()
  })

  it('renders a misalignment with its ranges and every declaration site', () => {
    const check: HealthCheck = {
      id: 'versionAlignment',
      severity: 'warning',
      findings: [
        {
          severity: 'warning',
          dependency: 'react',
          actual: '^18.2.0, ^18.3.1',
          expected: null,
          refs: [
            {
              package: '@app/ui',
              path: 'packages/ui/package.json',
              field: 'dependencies',
              range: '^18.3.1',
            },
            {
              package: '@app/app',
              path: 'packages/app/package.json',
              field: 'dependencies',
              range: '^18.2.0',
            },
          ],
        },
      ],
    }
    render(<HealthCheckReport check={check} />)

    expect(screen.getByText('1 finding')).toBeInTheDocument()
    expect(screen.getByText('react')).toBeInTheDocument()
    expect(screen.getByText('Ranges: ^18.2.0, ^18.3.1')).toBeInTheDocument()

    // Both sites sit on the finding's own line, not in a labelled sub-list.
    const finding = screen.getByTestId('health-finding')
    const refs = within(finding).getAllByTestId('health-finding-ref')
    expect(refs).toHaveLength(2)
    expect(refs[0]).toHaveTextContent('@app/ui')
    expect(refs[0]).toHaveTextContent('^18.3.1')
    expect(refs[1]).toHaveTextContent('@app/app')
    expect(refs[1]).toHaveTextContent('^18.2.0')
    expect(screen.queryByText('Declared in')).not.toBeInTheDocument()
  })

  /**
   * The explanation gets the full width beneath the facts rather than competing for
   * room with the name and the chips — the catalog fix in particular is a sentence.
   */
  it('puts the explanation on its own line, below the declaration sites', () => {
    const check: HealthCheck = {
      id: 'catalogDrift',
      severity: 'warning',
      findings: [
        {
          severity: 'warning',
          dependency: '@vitest/browser',
          actual: '^3.0.7',
          expected: '^3.0.7',
          refs: [
            {
              package: '@app/editor',
              path: 'packages/editor/package.json',
              field: 'devDependencies',
              range: '^3.0.7',
            },
          ],
        },
      ],
    }
    render(<HealthCheckReport check={check} />)

    const description = screen.getByTestId('health-finding-description')
    expect(description).toHaveTextContent(
      'Declares ^3.0.7 — replace it with "catalog:" (the catalog pins ^3.0.7)'
    )
    // A sibling of the facts row, not a cell inside it.
    expect(within(description).queryByTestId('health-finding-ref')).not.toBeInTheDocument()
    expect(description.tagName).toBe('P')
  })

  /** For a duplicate the field *is* the finding, so it must stay on the line. */
  it('keeps the manifest field visible on each declaration site', () => {
    const check: HealthCheck = {
      id: 'duplicateDependency',
      severity: 'error',
      findings: [
        {
          severity: 'error',
          dependency: 'lodash',
          actual: null,
          expected: null,
          refs: [
            { package: 'root', path: 'package.json', field: 'dependencies', range: '^4.0.0' },
            { package: 'root', path: 'package.json', field: 'devDependencies', range: '^4.17.0' },
          ],
        },
      ],
    }
    render(<HealthCheckReport check={check} />)

    const refs = screen.getAllByTestId('health-finding-ref')
    expect(refs[0]).toHaveTextContent('dependencies')
    expect(refs[1]).toHaveTextContent('devDependencies')
  })

  it('renders a repo-level finding that has no dependency name', () => {
    const check: HealthCheck = {
      id: 'packageManagerField',
      severity: 'error',
      findings: [
        { severity: 'error', dependency: null, refs: [], actual: 'npm@10.0.0', expected: 'pnpm' },
      ],
    }
    render(<HealthCheckReport check={check} />)

    expect(screen.getByText('Problem')).toBeInTheDocument()
    expect(screen.getByText('Declares npm@10.0.0 but the lockfile says pnpm')).toBeInTheDocument()
  })

  it('pluralises the finding count', () => {
    const check: HealthCheck = {
      id: 'duplicateDependency',
      severity: 'error',
      findings: [
        { severity: 'error', dependency: 'lodash', refs: [], actual: null, expected: null },
        { severity: 'error', dependency: 'axios', refs: [], actual: null, expected: null },
      ],
    }
    render(<HealthCheckReport check={check} />)

    expect(screen.getByText('2 findings')).toBeInTheDocument()
    expect(screen.getAllByTestId('health-finding')).toHaveLength(2)
  })
})
