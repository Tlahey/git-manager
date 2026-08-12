import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/errorReport.api', async () => {
  const actual =
    await vi.importActual<typeof import('../api/errorReport.api')>('../api/errorReport.api')
  return {
    ...actual,
    apiFindReportedIssue: vi.fn().mockResolvedValue(null),
    apiCreateErrorIssue: vi.fn(),
    apiCommentOnReportedIssue: vi.fn(),
  }
})
vi.mock('../../../api/updater.api', () => ({
  apiGetAppVersion: vi.fn().mockResolvedValue('0.2.1'),
}))
vi.mock('../../../api/shell.api', () => ({ apiOpenUrl: vi.fn() }))

import {
  apiCommentOnReportedIssue,
  apiCreateErrorIssue,
  apiFindReportedIssue,
} from '../api/errorReport.api'
import { apiOpenUrl } from '../../../api/shell.api'
import { useSettingsStore } from '../../../stores/settings.store'
import { useErrorReportStore } from '../stores/errorReport.store'
import type { ErrorReportDraft } from '../lib/buildReport'
import { ErrorReportDialog } from './ErrorReportDialog'

function draft(overrides: Partial<ErrorReportDraft> = {}): ErrorReportDraft {
  return {
    kind: 'operation',
    code: 'UNKNOWN',
    message: 'something broke',
    command: 'git_push',
    timestamp: 1_700_000_000_000,
    context: [],
    ...overrides,
  }
}

/**
 * `connected` rather than a token: since secrets moved to the keychain an account carries only its
 * public half, and what the feature passes to GitHub is the account id.
 */
function connectAccount(connected: boolean) {
  useSettingsStore.setState((s) => ({
    settings: {
      ...s.settings,
      github: connected
        ? {
            accounts: [
              { id: 'octocat', user: { login: 'octocat', name: null, email: null, avatarUrl: '' } },
            ],
            activeAccountId: 'octocat',
          }
        : { accounts: [], activeAccountId: null },
    },
  }))
}

function renderDialog(d: ErrorReportDraft = draft()) {
  const onClose = vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
  render(<ErrorReportDialog draft={d} open onClose={onClose} />, { wrapper })
  return { onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(apiFindReportedIssue).mockResolvedValue(null)
  useErrorReportStore.setState({ draft: null, reported: {} })
  connectAccount(true)
})

describe('ErrorReportDialog', () => {
  it('shows the exact body that will be posted, not a summary of it', async () => {
    renderDialog()
    const preview = await screen.findByTestId('error-report-preview')
    expect(preview.textContent).toContain('<!-- gm-fp:')
    expect(preview.textContent).toContain('code:    UNKNOWN')
    expect(preview.textContent).toContain('message: something broke')
  })

  it('rebuilds the preview as the reporter types, so what they read is what is sent', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByTestId('error-report-description'), 'I clicked push')

    await waitFor(() =>
      expect(screen.getByTestId('error-report-preview').textContent).toContain('I clicked push')
    )
  })

  it('calls a crash a bug and lets it be reported straight away', async () => {
    renderDialog(draft({ kind: 'crash', code: undefined, message: 'x is null' }))
    expect(await screen.findByTestId('report-verdict-bug')).toBeInTheDocument()
    expect(screen.getByTestId('error-report-submit')).toBeEnabled()
  })

  it('explains a protected-branch refusal instead of filing it', async () => {
    renderDialog(draft({ code: 'PROTECTED_BRANCH' }))

    expect(await screen.findByTestId('report-verdict-expected')).toBeInTheDocument()
    expect(screen.getByText('This is not a bug.')).toBeInTheDocument()
    expect(screen.getByText(/branch is protected/)).toBeInTheDocument()
    expect(screen.getByTestId('error-report-submit')).toBeDisabled()
  })

  it('still lets the reporter override that verdict — the table is a heuristic', async () => {
    const user = userEvent.setup()
    renderDialog(draft({ code: 'PROTECTED_BRANCH' }))

    await user.click(await screen.findByTestId('error-report-anyway'))
    expect(screen.getByTestId('error-report-submit')).toBeEnabled()
  })

  it('requires a description for an error Git might simply have refused', async () => {
    const user = userEvent.setup()
    renderDialog(draft({ code: 'GIT_ERROR', message: 'cannot lock ref' }))

    expect(await screen.findByTestId('report-verdict-unclear')).toBeInTheDocument()
    expect(screen.getByTestId('error-report-submit')).toBeDisabled()

    await user.type(screen.getByTestId('error-report-description'), 'push worked in the terminal')
    expect(screen.getByTestId('error-report-submit')).toBeEnabled()
  })

  it('files the issue and shows where it landed', async () => {
    const user = userEvent.setup()
    vi.mocked(apiCreateErrorIssue).mockResolvedValue({
      number: 42,
      url: 'https://github.com/Tlahey/git-manager/issues/42',
    })
    renderDialog()

    await user.click(await screen.findByTestId('error-report-submit'))

    await screen.findByText('Issue opened. Thank you.')
    expect(apiCreateErrorIssue).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'UNKNOWN: something broke' }),
      'octocat'
    )
  })

  it('reports a failed submission instead of pretending it worked', async () => {
    const user = userEvent.setup()
    vi.mocked(apiCreateErrorIssue).mockRejectedValue(new Error('GitHub API 403'))
    renderDialog()

    await user.click(await screen.findByTestId('error-report-submit'))
    expect(await screen.findByTestId('error-report-error')).toHaveTextContent('GitHub API 403')
  })

  it('offers to join an existing report rather than duplicate it', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFindReportedIssue).mockResolvedValue({
      number: 7,
      url: 'https://github.com/Tlahey/git-manager/issues/7',
    } as never)
    renderDialog()

    expect(await screen.findByTestId('error-report-duplicate')).toHaveTextContent('issue #7')

    await user.click(screen.getByTestId('error-report-comment'))
    await waitFor(() =>
      expect(apiCommentOnReportedIssue).toHaveBeenCalledWith(7, expect.anything(), 'octocat')
    )
    expect(apiCreateErrorIssue).not.toHaveBeenCalled()
  })

  it('with no account connected, shows the report and no way to send it', async () => {
    connectAccount(false)
    renderDialog()

    expect(await screen.findByTestId('error-report-not-connected')).toBeInTheDocument()
    expect(screen.queryByTestId('error-report-submit')).not.toBeInTheDocument()
    // The body is still there to copy, which is the whole fallback.
    expect(screen.getByTestId('error-report-preview').textContent).toContain('something broke')
  })

  it('never searches GitHub with no account — an anonymous search would rate-limit in a few crashes', async () => {
    connectAccount(false)
    renderDialog()

    await screen.findByTestId('error-report-preview')
    expect(apiFindReportedIssue).not.toHaveBeenCalled()
  })

  it('opens the tracker in the browser for a reporter who will file it by hand', async () => {
    const user = userEvent.setup()
    connectAccount(false)
    renderDialog()

    await user.click(await screen.findByTestId('error-report-open-tracker'))
    expect(apiOpenUrl).toHaveBeenCalledWith('https://github.com/Tlahey/git-manager/issues')
  })

  it('says when this session already reported the same failure', async () => {
    renderDialog()
    const body = (await screen.findByTestId('error-report-preview')).textContent ?? ''
    const fingerprint = /gm-fp:([0-9a-f]{8})/.exec(body)?.[1] as string

    useErrorReportStore.getState().markReported(fingerprint, 'https://example.test/1')
    expect(await screen.findByTestId('error-report-already-sent')).toBeInTheDocument()
  })
})
