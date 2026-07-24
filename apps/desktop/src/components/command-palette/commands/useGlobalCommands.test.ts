import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const { toolbar } = vi.hoisted(() => ({
  toolbar: {
    activeRepo: null as string | null,
    hasStashes: false,
    handleFetch: vi.fn(),
    handleFetchAll: vi.fn(),
    handlePull: vi.fn(),
    handlePush: vi.fn(),
    handleStash: vi.fn(),
    handlePop: vi.fn(),
    handleOpenTerminal: vi.fn(),
  },
}))
vi.mock('../../../hooks/useActionToolbar', () => ({ useActionToolbar: () => toolbar }))

const { openRepository, toastError } = vi.hoisted(() => ({
  openRepository: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('../../../hooks/useOpenRepository', () => ({ useOpenRepository: () => openRepository }))
vi.mock('@git-manager/ui', () => ({ toast: { error: toastError, success: vi.fn() } }))

import { useGlobalCommands } from './useGlobalCommands'
import {
  useRepoUIStore,
  DASHBOARD_TAB,
  PULL_REQUESTS_TAB,
  REWARDS_TAB,
} from '../../../stores/repoUI.store'

const INITIAL = useRepoUIStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useRepoUIStore.setState(INITIAL, true)
  toolbar.activeRepo = null
  toolbar.hasStashes = false
})

function ids(onOpenSettings = vi.fn(), onOpenActivityLogs = vi.fn()) {
  const { result } = renderHook(() => useGlobalCommands({ onOpenSettings, onOpenActivityLogs }))
  return { commands: result.current, byId: (id: string) => result.current.find((c) => c.id === id) }
}

describe('useGlobalCommands — availability', () => {
  it('always exposes navigation + settings, but no repo commands without an active repo', () => {
    const { commands } = ids()
    expect(commands.some((c) => c.id === 'nav-dashboard')).toBe(true)
    expect(commands.some((c) => c.id === 'settings-general')).toBe(true)
    expect(commands.some((c) => c.group === 'repo')).toBe(false)
  })

  it('adds repo commands when a repo is active', () => {
    toolbar.activeRepo = '/repo'
    const { commands } = ids()
    expect(commands.some((c) => c.id === 'repo-create-pr')).toBe(true)
    expect(commands.some((c) => c.id === 'repo-fetch')).toBe(true)
    expect(commands.some((c) => c.id === 'repo-terminal')).toBe(true)
  })

  it('only shows the pop command when there are stashes', () => {
    toolbar.activeRepo = '/repo'
    expect(ids().commands.some((c) => c.id === 'repo-pop')).toBe(false)
    toolbar.hasStashes = true
    expect(ids().commands.some((c) => c.id === 'repo-pop')).toBe(true)
  })

  it('exposes one settings command per section', () => {
    const settingsIds = ids().commands.filter((c) => c.group === 'settings').map((c) => c.id)
    expect(settingsIds).toContain('settings-ui_customization')
    expect(settingsIds).not.toContain('settings-debug')
    expect(settingsIds).toHaveLength(8)
  })

  it('exposes the activity logs navigation command', () => {
    expect(ids().commands.some((c) => c.id === 'nav-activity-logs')).toBe(true)
  })
})

describe('useGlobalCommands — run', () => {
  it('navigation commands switch tabs', () => {
    ids().byId('nav-dashboard')!.run()
    expect(useRepoUIStore.getState().activeTab).toBe(DASHBOARD_TAB)
    ids().byId('nav-pull-requests')!.run()
    expect(useRepoUIStore.getState().activeTab).toBe(PULL_REQUESTS_TAB)
    ids().byId('nav-rewards')!.run()
    expect(useRepoUIStore.getState().activeTab).toBe(REWARDS_TAB)
  })

  it('repo-create-pr opens the create PR view and switches to the active repo tab', () => {
    toolbar.activeRepo = '/repo'
    ids().byId('repo-create-pr')!.run()
    expect(useRepoUIStore.getState().activeTab).toBe('/repo')
    expect(useRepoUIStore.getState().prCreateOpen).toBe(true)
  })

  it('repo commands delegate to the toolbar handlers', () => {
    toolbar.activeRepo = '/repo'
    toolbar.hasStashes = true
    const { byId } = ids()
    byId('repo-fetch')!.run()
    byId('repo-pull')!.run()
    byId('repo-pop')!.run()
    expect(toolbar.handleFetch).toHaveBeenCalledOnce()
    expect(toolbar.handlePull).toHaveBeenCalledOnce()
    expect(toolbar.handlePop).toHaveBeenCalledOnce()
  })

  it('open-repo delegates to useOpenRepository', () => {
    openRepository.mockResolvedValue(true)
    ids().byId('repo-open')!.run()
    expect(openRepository).toHaveBeenCalledOnce()
  })

  it('settings commands call onOpenSettings with the section id', () => {
    const onOpenSettings = vi.fn()
    ids(onOpenSettings).byId('settings-ssh')!.run()
    expect(onOpenSettings).toHaveBeenCalledWith('ssh')
  })

  it('the activity logs command calls onOpenActivityLogs', () => {
    const onOpenActivityLogs = vi.fn()
    ids(vi.fn(), onOpenActivityLogs).byId('nav-activity-logs')!.run()
    expect(onOpenActivityLogs).toHaveBeenCalledOnce()
  })
})
