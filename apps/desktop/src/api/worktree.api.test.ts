import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({
  listWorktrees: vi.fn(),
  addWorktree: vi.fn(),
  removeWorktree: vi.fn(),
}))

import * as tauri from '../lib/tauri'
import * as api from './worktree.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>
const PATH = '/repo/a'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('worktree.api pass-throughs', () => {
  it('apiListWorktrees delegates to listWorktrees', async () => {
    mocked.listWorktrees.mockResolvedValue([])
    await api.apiListWorktrees(PATH)
    expect(mocked.listWorktrees).toHaveBeenCalledWith(PATH)
  })

  it('apiAddWorktree delegates to addWorktree with the branch and target path', async () => {
    mocked.addWorktree.mockResolvedValue(undefined)
    await api.apiAddWorktree(PATH, 'feature-x', '/repo/a-worktree')
    expect(mocked.addWorktree).toHaveBeenCalledWith(PATH, 'feature-x', '/repo/a-worktree')
  })

  it('apiRemoveWorktree defaults force to false', async () => {
    mocked.removeWorktree.mockResolvedValue(undefined)
    await api.apiRemoveWorktree(PATH, '/repo/a-worktree')
    expect(mocked.removeWorktree).toHaveBeenCalledWith(PATH, '/repo/a-worktree', false)
  })

  it('apiRemoveWorktree forwards an explicit force flag', async () => {
    mocked.removeWorktree.mockResolvedValue(undefined)
    await api.apiRemoveWorktree(PATH, '/repo/a-worktree', true)
    expect(mocked.removeWorktree).toHaveBeenCalledWith(PATH, '/repo/a-worktree', true)
  })
})
