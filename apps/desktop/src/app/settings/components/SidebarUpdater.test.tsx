import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SidebarUpdater } from './SidebarUpdater'
import { useAppUpdaterStore } from '../../../stores/appUpdater.store'

const INITIAL = useAppUpdaterStore.getState()

beforeEach(() => {
  useAppUpdaterStore.setState(INITIAL, true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SidebarUpdater', () => {
  it('shows the current version and a check button when idle', () => {
    useAppUpdaterStore.setState({ currentVersion: '1.2.3' })
    render(<SidebarUpdater />)
    expect(screen.getByTestId('sidebar-updater-version')).toHaveTextContent('1.2.3')
    expect(screen.getByTestId('sidebar-updater-check')).toBeInTheDocument()
  })

  it('runs the check when the button is clicked', async () => {
    const checkForUpdate = vi.fn()
    useAppUpdaterStore.setState({ checkForUpdate })
    const user = userEvent.setup()
    render(<SidebarUpdater />)
    await user.click(screen.getByTestId('sidebar-updater-check'))
    expect(checkForUpdate).toHaveBeenCalledTimes(1)
  })

  it('disables the button while checking', () => {
    useAppUpdaterStore.setState({ status: 'checking' })
    render(<SidebarUpdater />)
    expect(screen.getByTestId('sidebar-updater-check')).toBeDisabled()
  })

  it('shows the up-to-date message', () => {
    useAppUpdaterStore.setState({ status: 'up-to-date' })
    render(<SidebarUpdater />)
    expect(screen.getByTestId('sidebar-updater-up-to-date')).toBeInTheDocument()
  })

  it('promotes to a download button when an update is available', async () => {
    const downloadAndInstall = vi.fn()
    useAppUpdaterStore.setState({
      status: 'available',
      availableVersion: '1.4.0',
      downloadAndInstall,
    })
    const user = userEvent.setup()
    render(<SidebarUpdater />)
    const button = screen.getByTestId('sidebar-updater-download')
    expect(button).toHaveTextContent('1.4.0')
    // The check button is replaced, not shown alongside.
    expect(screen.queryByTestId('sidebar-updater-check')).not.toBeInTheDocument()
    await user.click(button)
    expect(downloadAndInstall).toHaveBeenCalledTimes(1)
  })

  it('renders a progress bar while downloading', () => {
    useAppUpdaterStore.setState({
      status: 'downloading',
      progress: { downloadedBytes: 50, contentLength: 100 },
    })
    render(<SidebarUpdater />)
    expect(screen.getByTestId('sidebar-updater-progress')).toBeInTheDocument()
  })

  it('offers a restart when the update is ready', async () => {
    const relaunch = vi.fn()
    useAppUpdaterStore.setState({ status: 'ready', relaunch })
    const user = userEvent.setup()
    render(<SidebarUpdater />)
    await user.click(screen.getByTestId('sidebar-updater-restart'))
    expect(relaunch).toHaveBeenCalledTimes(1)
  })

  it('shows a generic error message on failure — never the raw technical error', () => {
    useAppUpdaterStore.setState({ status: 'error', error: 'Could not fetch a valid release JSON' })
    render(<SidebarUpdater />)
    const message = screen.getByTestId('sidebar-updater-error')
    // The raw error goes to the activity log, not the UI; the user sees a retry hint instead.
    expect(message).not.toHaveTextContent('Could not fetch a valid release JSON')
    expect(message).toHaveTextContent(/activity log/i)
    // Retry stays available via the check button.
    expect(screen.getByTestId('sidebar-updater-check')).toBeInTheDocument()
  })
})
