import { describe, it, expect } from 'vitest'
import type { DebugLogEntry } from '../stores/debugLog.store'
import { formatDebugLogEntry, formatDebugLogText, formatDebugTimestamp } from './formatDebugLog'

function entry(overrides: Partial<DebugLogEntry> = {}): DebugLogEntry {
  return {
    id: '1',
    timestamp: new Date('2026-07-12T09:08:07.006').getTime(),
    command: 'get_log',
    args: { path: '/repo' },
    durationMs: 12,
    status: 'ok',
    ...overrides,
  }
}

describe('formatDebugTimestamp', () => {
  it('formats local wall-clock time with milliseconds', () => {
    expect(formatDebugTimestamp(new Date('2026-07-12T09:08:07.006').getTime())).toBe('09:08:07.006')
  })
})

describe('formatDebugLogEntry', () => {
  it('renders a single line for a successful entry with args', () => {
    const line = formatDebugLogEntry(entry())
    expect(line).toContain('OK')
    expect(line).toContain('12ms')
    expect(line).toContain('get_log')
    expect(line).toContain('{"path":"/repo"}')
    expect(line).not.toContain('\n')
  })

  it('appends an indented error line when the entry failed', () => {
    const line = formatDebugLogEntry(entry({ status: 'error', error: 'boom' }))
    expect(line).toContain('ERROR')
    expect(line).toMatch(/\n\s+↳ boom/)
  })

  it('renders string args verbatim (already redacted upstream)', () => {
    expect(formatDebugLogEntry(entry({ args: '[redacted]' }))).toContain('[redacted]')
  })
})

describe('formatDebugLogText', () => {
  it('emits entries oldest-first (buffer is stored newest-first)', () => {
    const newest = entry({ id: 'b', command: 'second' })
    const oldest = entry({ id: 'a', command: 'first' })
    const text = formatDebugLogText([newest, oldest])
    expect(text.indexOf('first')).toBeLessThan(text.indexOf('second'))
  })
})
