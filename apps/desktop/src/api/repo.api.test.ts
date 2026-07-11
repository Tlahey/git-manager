import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({
  openRepo: vi.fn(),
  scanRepos: vi.fn(),
  getRepoSummary: vi.fn(),
  openInEditor: vi.fn(),
  getRepoReadme: vi.fn(),
  cloneRepo: vi.fn(),
  initRepo: vi.fn(),
}))

import * as tauri from '../lib/tauri'
import * as api from './repo.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>
const PATH = '/repo/a'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('repo.api pass-throughs', () => {
  it('apiOpenRepo delegates to openRepo', async () => {
    mocked.openRepo.mockResolvedValue({ path: PATH })
    await api.apiOpenRepo(PATH)
    expect(mocked.openRepo).toHaveBeenCalledWith(PATH)
  })

  it('apiCloneRepo forwards optional shallow/sparse flags', async () => {
    mocked.cloneRepo.mockResolvedValue(undefined)
    await api.apiCloneRepo('git@github.com:org/repo.git', '/dest', true, false)
    expect(mocked.cloneRepo).toHaveBeenCalledWith('git@github.com:org/repo.git', '/dest', true, false)
  })

  it('apiInitRepo delegates to initRepo', async () => {
    mocked.initRepo.mockResolvedValue(undefined)
    await api.apiInitRepo(PATH)
    expect(mocked.initRepo).toHaveBeenCalledWith(PATH)
  })

  it('apiScanRepos delegates to scanRepos with maxDepth', async () => {
    mocked.scanRepos.mockResolvedValue([])
    await api.apiScanRepos('/home/me/projects', 3)
    expect(mocked.scanRepos).toHaveBeenCalledWith('/home/me/projects', 3)
  })

  it('apiGetRepoSummary delegates to getRepoSummary', async () => {
    mocked.getRepoSummary.mockResolvedValue({ path: PATH })
    await api.apiGetRepoSummary(PATH)
    expect(mocked.getRepoSummary).toHaveBeenCalledWith(PATH)
  })

  it('apiOpenInEditor forwards an optional custom command', async () => {
    mocked.openInEditor.mockResolvedValue(undefined)
    await api.apiOpenInEditor(PATH, 'custom', 'my-editor {path}')
    expect(mocked.openInEditor).toHaveBeenCalledWith(PATH, 'custom', 'my-editor {path}')
  })

  it('apiGetRepoReadme delegates to getRepoReadme', async () => {
    mocked.getRepoReadme.mockResolvedValue('# Readme')
    expect(await api.apiGetRepoReadme(PATH)).toBe('# Readme')
  })
})
