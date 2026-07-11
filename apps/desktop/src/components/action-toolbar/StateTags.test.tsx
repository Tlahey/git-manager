import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { GitRepo } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { StateTags } from './StateTags'
import { useRepoDataStore } from '../../stores/repoData.store'
import { useRepoUIStore } from '../../stores/repoUI.store'

function repo(overrides: Partial<GitRepo> = {}): GitRepo {
  return { path: '/repo', name: 'repo', head: 'main', isDetached: false, isDirty: false, remotes: [], ...overrides }
}

beforeEach(() => {
  useRepoUIStore.setState({ activeRepo: null })
  useRepoDataStore.setState({ repoCache: {} })
})

describe('StateTags', () => {
  it('renders nothing when there is no active repo', () => {
    const { container } = render(<StateTags />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the active repo is clean', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({ repoCache: { '/repo': repo({ isDirty: false }) } })
    render(<StateTags />)
    expect(screen.queryByText('toolbar.dirty')).not.toBeInTheDocument()
  })

  it('shows a dirty badge when the active repo has uncommitted changes', () => {
    useRepoUIStore.setState({ activeRepo: '/repo' })
    useRepoDataStore.setState({ repoCache: { '/repo': repo({ isDirty: true }) } })
    render(<StateTags />)
    expect(screen.getByText('toolbar.dirty')).toBeInTheDocument()
  })
})
