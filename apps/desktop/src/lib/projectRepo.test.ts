import { describe, it, expect } from 'vitest'
import { PROJECT_ISSUES_URL, PROJECT_REPO, PROJECT_REPO_URL } from './projectRepo'

describe('projectRepo', () => {
  it('names the app’s own repository', () => {
    expect(PROJECT_REPO).toEqual({ owner: 'Tlahey', repo: 'git-manager' })
  })

  it('derives every URL from that one slug, so a fork changes one line', () => {
    expect(PROJECT_REPO_URL).toBe('https://github.com/Tlahey/git-manager')
    expect(PROJECT_ISSUES_URL).toBe('https://github.com/Tlahey/git-manager/issues')
  })

  it('still matches the updater endpoint, which lives outside TypeScript', async () => {
    // `tauri.conf.json` names the same repository and Tauri reads it at build time, so it cannot
    // import this module. This is the only thing that notices when the two drift apart.
    const conf = await import('../../src-tauri/tauri.conf.json')
    const endpoints: string[] = conf.default.plugins.updater.endpoints
    expect(endpoints.every((url) => url.startsWith(`${PROJECT_REPO_URL}/`))).toBe(true)
  })
})
