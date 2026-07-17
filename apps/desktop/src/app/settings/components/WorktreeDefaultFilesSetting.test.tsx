import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

// Drive the per-pattern counts deterministically: `.env*` and `*.pem` match files; anything else
// (e.g. `nope/*`) matches nothing, so its save icon must stay hidden.
const { countsMock } = vi.hoisted(() => ({
  countsMock: (_repo: string | null, patterns: string[]) => {
    const map: Record<string, number> = {}
    for (const p of patterns) {
      const trimmed = p.trim()
      if (trimmed === '.env*' || trimmed === '*.pem') map[trimmed] = 3
      else if (trimmed) map[trimmed] = 0
    }
    return map
  },
}))
vi.mock('../../../hooks/useDefaultFileMatchCounts', () => ({
  useDefaultFileMatchCounts: countsMock,
}))

import { useSettingsStore } from '../../../stores/settings.store'
import { WorktreeDefaultFilesSetting } from './WorktreeDefaultFilesSetting'

const REPO = '/repo'
const INITIAL = useSettingsStore.getState()

function override() {
  return useSettingsStore.getState().settings.repoOverrides[REPO]?.worktreeDefaultFiles
}

beforeEach(() => {
  useSettingsStore.setState(INITIAL, true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WorktreeDefaultFilesSetting — per-line editing', () => {
  it('shows an empty state and only an add button when nothing is saved', () => {
    render(<WorktreeDefaultFilesSetting repoPath={REPO} />)
    expect(screen.getByTestId('worktree-df-empty')).toBeInTheDocument()
    expect(screen.getByTestId('worktree-df-add')).toBeInTheDocument()
    expect(screen.queryByTestId('worktree-df-row')).not.toBeInTheDocument()
  })

  it('renders each saved pattern readonly with edit and delete icons', () => {
    useSettingsStore.getState().setRepoSetting(REPO, 'worktreeDefaultFiles', ['.env*', '*.pem'])
    render(<WorktreeDefaultFilesSetting repoPath={REPO} />)
    expect(screen.getAllByTestId('worktree-df-value').map((n) => n.textContent)).toEqual([
      '.env*',
      '*.pem',
    ])
    expect(screen.getAllByTestId('worktree-df-edit')).toHaveLength(2)
    expect(screen.getAllByTestId('worktree-df-delete')).toHaveLength(2)
    // Readonly rows have no input or save control.
    expect(screen.queryByTestId('worktree-df-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('worktree-df-save')).not.toBeInTheDocument()
  })

  it('adding a row exposes an input, disables the add button, and hides save until valid', async () => {
    const user = userEvent.setup()
    render(<WorktreeDefaultFilesSetting repoPath={REPO} />)
    await user.click(screen.getByTestId('worktree-df-add'))

    expect(screen.getByTestId('worktree-df-input')).toBeInTheDocument()
    expect(screen.getByTestId('worktree-df-add')).toBeDisabled()
    // Empty line → no save icon (can't save an empty line).
    expect(screen.queryByTestId('worktree-df-save')).not.toBeInTheDocument()
  })

  it('does not show the save icon for a pattern that matches no files', async () => {
    const user = userEvent.setup()
    render(<WorktreeDefaultFilesSetting repoPath={REPO} />)
    await user.click(screen.getByTestId('worktree-df-add'))
    await user.type(screen.getByTestId('worktree-df-input'), 'nope/*')
    expect(screen.queryByTestId('worktree-df-save')).not.toBeInTheDocument()
    // Nothing persisted.
    expect(override()).toBeUndefined()
  })

  it('saving a valid pattern persists it and returns the row to readonly', async () => {
    const user = userEvent.setup()
    render(<WorktreeDefaultFilesSetting repoPath={REPO} />)
    await user.click(screen.getByTestId('worktree-df-add'))
    await user.type(screen.getByTestId('worktree-df-input'), '.env*')
    await user.click(screen.getByTestId('worktree-df-save'))

    expect(override()).toEqual(['.env*'])
    expect(screen.getByTestId('worktree-df-value')).toHaveTextContent('.env*')
    expect(screen.getByTestId('worktree-df-add')).toBeEnabled()
  })

  it('deleting a saved row removes it and updates the persisted list', async () => {
    useSettingsStore.getState().setRepoSetting(REPO, 'worktreeDefaultFiles', ['.env*', '*.pem'])
    const user = userEvent.setup()
    render(<WorktreeDefaultFilesSetting repoPath={REPO} />)
    await user.click(screen.getAllByTestId('worktree-df-delete')[0])
    expect(override()).toEqual(['*.pem'])
  })

  it('deleting the last saved row clears the override entirely', async () => {
    useSettingsStore.getState().setRepoSetting(REPO, 'worktreeDefaultFiles', ['.env*'])
    const user = userEvent.setup()
    render(<WorktreeDefaultFilesSetting repoPath={REPO} />)
    await user.click(screen.getByTestId('worktree-df-delete'))
    expect(useSettingsStore.getState().settings.repoOverrides[REPO]).toBeUndefined()
  })

  it('editing one line keeps a previously-saved sibling in the persisted list', async () => {
    useSettingsStore.getState().setRepoSetting(REPO, 'worktreeDefaultFiles', ['.env*', '*.pem'])
    const user = userEvent.setup()
    render(<WorktreeDefaultFilesSetting repoPath={REPO} />)
    // Edit the first row but don't save — the override must still contain both patterns.
    await user.click(screen.getAllByTestId('worktree-df-edit')[0])
    expect(override()).toEqual(['.env*', '*.pem'])
  })
})
