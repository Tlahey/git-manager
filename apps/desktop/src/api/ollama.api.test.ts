import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({
  checkOllamaStatus: vi.fn(),
  generateCommitMessage: vi.fn(),
  cancelGeneration: vi.fn(),
}))

import * as tauri from '../lib/tauri'
import * as api from './ollama.api'

const mocked = tauri as unknown as Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ollama.api pass-throughs', () => {
  it('apiCheckOllamaStatus delegates to checkOllamaStatus with the url', async () => {
    mocked.checkOllamaStatus.mockResolvedValue(true)
    expect(await api.apiCheckOllamaStatus('http://localhost:11434')).toBe(true)
    expect(mocked.checkOllamaStatus).toHaveBeenCalledWith('http://localhost:11434')
  })

  it('apiGenerateCommitMessage delegates to generateCommitMessage with an optional prompt hint', async () => {
    mocked.generateCommitMessage.mockResolvedValue('feat: add thing')
    expect(await api.apiGenerateCommitMessage('/repo', 'llama3.2', 'be concise')).toBe('feat: add thing')
    expect(mocked.generateCommitMessage).toHaveBeenCalledWith('/repo', 'llama3.2', 'be concise')
  })

  it('apiCancelGeneration delegates to cancelGeneration', async () => {
    mocked.cancelGeneration.mockResolvedValue(undefined)
    await api.apiCancelGeneration()
    expect(mocked.cancelGeneration).toHaveBeenCalledOnce()
  })
})
