import { describe, it, expect } from 'vitest'
import { describePlatform } from './environment'

const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

describe('describePlatform', () => {
  it('names the OS and the WebKit build', () => {
    expect(describePlatform(MAC_UA)).toBe('macOS · WebKit build 605.1.15')
  })

  it('never reports the frozen macOS version WKWebView claims', () => {
    // WKWebView says `10_15_7` on every Mac since 2020, Apple Silicon included. Printing it in a
    // bug report would be wrong on essentially every machine that files one.
    expect(describePlatform(MAC_UA)).not.toContain('10')
  })

  it('recognises the other desktop platforms', () => {
    expect(describePlatform('Mozilla/5.0 (Windows NT 10.0)')).toBe('Windows')
    expect(describePlatform('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Linux')
  })

  it('says so rather than guessing when the user agent is unrecognisable', () => {
    expect(describePlatform('something else')).toBe('unknown OS')
  })
})
