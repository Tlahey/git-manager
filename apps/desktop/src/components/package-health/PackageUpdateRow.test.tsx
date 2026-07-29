import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { OutdatedPackage } from '@git-manager/git-types'
import { PackageUpdateRow } from './PackageUpdateRow'

function entry(overrides: Partial<OutdatedPackage> = {}): OutdatedPackage {
  return {
    name: 'react',
    current: '18.2.0',
    wanted: '18.3.1',
    latest: '19.0.0',
    majorUpdate: true,
    deprecated: false,
    ...overrides,
  }
}

const onUpdate = vi.fn()
const onShowChangelog = vi.fn()

function renderRow(overrides: Partial<OutdatedPackage> = {}, busy = false) {
  return render(
    <PackageUpdateRow
      entry={entry(overrides)}
      busy={busy}
      onUpdate={onUpdate}
      onShowChangelog={onShowChangelog}
    />
  )
}

describe('PackageUpdateRow', () => {
  beforeEach(() => {
    onUpdate.mockReset()
    onShowChangelog.mockReset()
  })

  /** Everything sits on one line, so the versions read as a chain from a single start. */
  it('states the current version once and each target after it', () => {
    renderRow()

    expect(screen.getByTestId('version-current')).toHaveTextContent('18.2.0')

    const inRange = screen.getByTestId('jump-in-range')
    expect(inRange).toHaveTextContent('18.3.1')
    expect(inRange).toHaveTextContent('In range')

    const latest = screen.getByTestId('jump-latest')
    expect(latest).toHaveTextContent('19.0.0')
    expect(latest).toHaveTextContent('Latest')
  })

  it('runs the in-range update immediately, without confirmation', async () => {
    renderRow()

    await userEvent.click(screen.getByTestId('update-in-range'))

    expect(onUpdate).toHaveBeenCalledWith(['react'], false)
    expect(screen.queryByTestId('major-confirm')).not.toBeInTheDocument()
  })

  /** A major can break the build, so the first click asks rather than runs. */
  it('confirms before crossing a major', async () => {
    renderRow()

    await userEvent.click(screen.getByTestId('update-latest'))

    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByTestId('major-confirm')).toHaveTextContent(
      'This crosses a major version and may break the build.'
    )

    await userEvent.click(screen.getByTestId('major-confirm-accept'))
    expect(onUpdate).toHaveBeenCalledWith(['react'], true)
  })

  it('abandons the major update on cancel', async () => {
    renderRow()

    await userEvent.click(screen.getByTestId('update-latest'))
    await userEvent.click(screen.getByTestId('major-confirm-cancel'))

    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.queryByTestId('major-confirm')).not.toBeInTheDocument()
  })

  it('goes straight to latest when it is not a major', async () => {
    renderRow({ latest: '18.4.0', majorUpdate: false })

    await userEvent.click(screen.getByTestId('update-latest'))

    expect(onUpdate).toHaveBeenCalledWith(['react'], true)
  })

  /** pnpm reports `wanted === current` when the range already allows nothing newer. */
  it('shows only the latest target when the range has no update', () => {
    renderRow({ wanted: '18.2.0' })

    expect(screen.queryByTestId('jump-in-range')).not.toBeInTheDocument()
    expect(screen.queryByTestId('update-in-range')).not.toBeInTheDocument()
    expect(screen.getByTestId('jump-latest')).toHaveTextContent('19.0.0')
  })

  /** When latest and wanted agree there is one destination, so don't print it twice. */
  it('shows a single target when both point at the same version', () => {
    renderRow({ wanted: '18.3.1', latest: '18.3.1', majorUpdate: false })

    expect(screen.getByTestId('jump-in-range')).toHaveTextContent('18.3.1')
    expect(screen.queryByTestId('jump-latest')).not.toBeInTheDocument()
  })

  it('hands the changelog to the side panel instead of expanding inline', async () => {
    renderRow()

    await userEvent.click(screen.getByTestId('toggle-changelog'))

    expect(onShowChangelog).toHaveBeenCalledWith(entry())
    expect(screen.queryByTestId('changelog')).not.toBeInTheDocument()
  })

  /**
   * The row is dense and the changelog button has no label at all, so hovering has
   * to say what each button would do — and name the version it lands on, which the
   * labels cannot.
   */
  it('explains each button on hover, naming its target version', async () => {
    renderRow()

    await userEvent.hover(screen.getByTestId('update-in-range'))
    expect(
      await screen.findByText('Update to 18.3.1 — the newest your declared range allows')
    ).toBeInTheDocument()

    await userEvent.hover(screen.getByTestId('toggle-changelog'))
    expect(
      await screen.findByText('Read the release notes for 18.2.0 → 19.0.0')
    ).toBeInTheDocument()
  })

  /** The warning belongs on the hover too, not only after the click. */
  it('warns on hover that the latest button crosses a major', async () => {
    renderRow()

    await userEvent.hover(screen.getByTestId('update-latest'))

    expect(
      await screen.findByText(
        "Update to 19.0.0 — crosses a major version, you'll be asked to confirm"
      )
    ).toBeInTheDocument()
  })

  it('drops the major warning from the hover when it is not one', async () => {
    renderRow({ latest: '18.4.0', majorUpdate: false })

    await userEvent.hover(screen.getByTestId('update-latest'))

    expect(
      await screen.findByText('Update to 18.4.0 — the newest published version')
    ).toBeInTheDocument()
  })

  it('disables the update buttons while one is running', () => {
    renderRow({}, true)

    expect(screen.getByTestId('update-in-range')).toBeDisabled()
    expect(screen.getByTestId('update-latest')).toBeDisabled()
  })

  it('flags a deprecated package', () => {
    renderRow({ deprecated: true })
    expect(screen.getByText('deprecated')).toBeInTheDocument()
  })
})
