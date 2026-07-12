import { describe, it, expect } from 'vitest'
import { redactArgs } from './debugLogRedact'

describe('redactArgs', () => {
  it('passes through undefined/null args', () => {
    expect(redactArgs('open_repo', undefined)).toBeUndefined()
    expect(redactArgs('open_repo', null)).toBeNull()
  })

  it('keeps ordinary scalar args intact', () => {
    expect(redactArgs('get_log', { path: '/repo', limit: 50 })).toEqual({
      path: '/repo',
      limit: 50,
    })
  })

  it('drops the whole arg object for auth/credential-shaped commands', () => {
    expect(redactArgs('github_exchange_token', { code: 'abc', clientId: 'x' })).toBe('[redacted]')
    expect(redactArgs('save_ssh_key', { key: 'PRIVATE' })).toBe('[redacted]')
    expect(redactArgs('set_github_token', { token: 't' })).toBe('[redacted]')
  })

  it('redacts individual secret-looking keys on otherwise safe commands', () => {
    expect(redactArgs('some_command', { path: '/r', password: 'hunter2', apiKey: 'k' })).toEqual({
      path: '/r',
      password: '[redacted]',
      apiKey: '[redacted]',
    })
  })

  it('truncates long strings but reports their real length', () => {
    const long = 'a'.repeat(500)
    const out = redactArgs('commit', { message: long }) as { message: string }
    expect(out.message).toContain('… (500 chars)')
    expect(out.message.length).toBeLessThan(long.length)
  })

  it('stringifies nested objects/arrays rather than keeping references', () => {
    const out = redactArgs('run_interactive_rebase', { steps: [{ action: 'pick' }] }) as {
      steps: unknown
    }
    expect(typeof out.steps).toBe('string')
    expect(out.steps).toContain('pick')
  })
})
