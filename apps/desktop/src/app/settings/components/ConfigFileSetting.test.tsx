import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../../api/config.api', () => ({
  apiGetAppConfigPath: vi.fn(),
  apiRevealAppConfig: vi.fn(),
}))

import { apiGetAppConfigPath, apiRevealAppConfig } from '../../../api/config.api'
import { ConfigFileSetting } from './ConfigFileSetting'

const CONFIG_PATH = '/Users/ada/.git-manager/settings.json'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ConfigFileSetting', () => {
  it('shows where the configuration lives', async () => {
    // The path is the answer to "where are my settings", so it is on screen as text and not only
    // behind a button — for anyone backing up a machine or asked for it in a bug report.
    vi.mocked(apiGetAppConfigPath).mockResolvedValue(CONFIG_PATH)
    render(<ConfigFileSetting />)

    expect(await screen.findByTestId('config-file-path')).toHaveTextContent(CONFIG_PATH)
    expect(screen.getByText('Configuration file')).toBeInTheDocument()
  })

  it('reveals that exact file, rather than a path of its own', async () => {
    // The affordance this replaced opened a hardcoded `~/.config/git-manager/` the app has never
    // used, and swallowed the failure — so it silently did nothing for as long as it shipped.
    vi.mocked(apiGetAppConfigPath).mockResolvedValue(CONFIG_PATH)
    const user = userEvent.setup()
    render(<ConfigFileSetting />)

    await user.click(await screen.findByTestId('reveal-config-file'))
    expect(apiRevealAppConfig).toHaveBeenCalledWith(CONFIG_PATH)
  })

  it('says the configuration is switched off instead of offering to reveal nothing', async () => {
    // `GIT_MANAGER_NO_CONFIG` — there is no file, and there never will be one this session.
    vi.mocked(apiGetAppConfigPath).mockResolvedValue(null)
    render(<ConfigFileSetting />)

    expect(await screen.findByTestId('config-file-disabled')).toHaveTextContent(
      'GIT_MANAGER_NO_CONFIG'
    )
    expect(screen.queryByTestId('reveal-config-file')).not.toBeInTheDocument()
  })

  it('renders nothing until the path is known', async () => {
    // Not "no configuration file" for a frame and then a path: that reads as a state the user was
    // never in.
    let resolve: (value: string | null) => void = () => {}
    vi.mocked(apiGetAppConfigPath).mockReturnValue(
      new Promise<string | null>((r) => {
        resolve = r
      })
    )
    const { container } = render(<ConfigFileSetting />)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByTestId('config-file-disabled')).not.toBeInTheDocument()

    resolve(CONFIG_PATH)
    await waitFor(() => expect(screen.getByTestId('config-file-path')).toBeInTheDocument())
  })
})
