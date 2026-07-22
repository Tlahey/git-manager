import { describe, it, expect } from 'vitest'
import { formatActivityData } from './formatActivityData'

describe('formatActivityData', () => {
  it('returns an empty string for missing data', () => {
    expect(formatActivityData(undefined)).toBe('')
    expect(formatActivityData(null)).toBe('')
  })

  it('pretty-prints an object with indentation', () => {
    expect(formatActivityData({ path: '/repo', amend: false })).toBe(
      '{\n  "path": "/repo",\n  "amend": false\n}'
    )
  })

  it('parses and pretty-prints a JSON string', () => {
    expect(formatActivityData('{"path":"/repo"}')).toBe('{\n  "path": "/repo"\n}')
  })

  it('expands a nested stringified JSON value', () => {
    const out = formatActivityData({ opts: '{"limit":10}' })
    expect(out).toContain('"opts": {')
    expect(out).toContain('"limit": 10')
  })

  it('leaves non-JSON strings untouched', () => {
    expect(formatActivityData('[redacted]')).toBe('[redacted]')
    expect(formatActivityData('hello world')).toBe('hello world')
  })

  it('keeps an unparseable (truncated) JSON-looking string as is', () => {
    const truncated = '{"diff":"aaaa… (5000 chars)'
    expect(formatActivityData(truncated)).toBe(truncated)
  })
})
