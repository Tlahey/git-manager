import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

const { useAppUpdater } = vi.hoisted(() => ({ useAppUpdater: vi.fn() }))
vi.mock('../../../hooks/useAppUpdater', () => ({ useAppUpdater }))

import { UpdateCheck } from './UpdateCheck'

function updaterState(overrides: Partial<ReturnType<typeof useAppUpdater>> = {}) {
  return {
    status: 'idle',
    currentVersion: '1.0.0',
    availableVersion: null,
    releaseNotes: null,
    progress: null,
    error: null,
    checkForUpdate: vi.fn(),
    downloadAndInstall: vi.fn(),
    relaunch: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UpdateCheck — idle', () => {
  it('shows the current version and a check button', () => {
    useAppUpdater.mockReturnValue(updaterState())
    render(<UpdateCheck />)
    expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument()
    expect(screen.getByTestId('update-check-button')).toBeInTheDocument()
  })

  it('triggers checkForUpdate on click', async () => {
    const checkForUpdate = vi.fn()
    useAppUpdater.mockReturnValue(updaterState({ checkForUpdate }))
    const user = userEvent.setup()
    render(<UpdateCheck />)
    await user.click(screen.getByTestId('update-check-button'))
    expect(checkForUpdate).toHaveBeenCalled()
  })
})

describe('UpdateCheck — up to date', () => {
  it('shows the up-to-date message', () => {
    useAppUpdater.mockReturnValue(updaterState({ status: 'up-to-date' }))
    render(<UpdateCheck />)
    expect(screen.getByTestId('update-up-to-date')).toBeInTheDocument()
  })
})

describe('UpdateCheck — error', () => {
  it('shows the error message and a retry button', async () => {
    const checkForUpdate = vi.fn()
    useAppUpdater.mockReturnValue(
      updaterState({ status: 'error', error: 'network down', checkForUpdate })
    )
    const user = userEvent.setup()
    render(<UpdateCheck />)
    expect(screen.getByTestId('update-error')).toHaveTextContent('network down')
    await user.click(screen.getByText('settings.update.retry'))
    expect(checkForUpdate).toHaveBeenCalled()
  })
})

describe('UpdateCheck — available', () => {
  it('shows the available version, release notes, and a download button', async () => {
    const downloadAndInstall = vi.fn()
    useAppUpdater.mockReturnValue(
      updaterState({
        status: 'available',
        availableVersion: '1.1.0',
        releaseNotes: 'Bug fixes',
        downloadAndInstall,
      })
    )
    const user = userEvent.setup()
    render(<UpdateCheck />)
    expect(screen.getByText('Bug fixes')).toBeInTheDocument()
    await user.click(screen.getByTestId('update-download-button'))
    expect(downloadAndInstall).toHaveBeenCalled()
  })
})

describe('UpdateCheck — downloading', () => {
  it('shows a progress bar sized to the download percentage', () => {
    useAppUpdater.mockReturnValue(
      updaterState({
        status: 'downloading',
        availableVersion: '1.1.0',
        progress: { downloadedBytes: 50, contentLength: 100 },
      })
    )
    render(<UpdateCheck />)
    const bar = screen.getByTestId('update-progress').querySelector('.bg-primary') as HTMLElement
    expect(bar.style.width).toBe('50%')
  })
})

describe('UpdateCheck — ready', () => {
  it('shows a restart button that relaunches the app', async () => {
    const relaunch = vi.fn()
    useAppUpdater.mockReturnValue(
      updaterState({ status: 'ready', availableVersion: '1.1.0', relaunch })
    )
    const user = userEvent.setup()
    render(<UpdateCheck />)
    await user.click(screen.getByTestId('update-restart-button'))
    expect(relaunch).toHaveBeenCalled()
  })
})
