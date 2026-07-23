import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { hideAppSplash } from './appSplash'

describe('hideAppSplash', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="app-splash"></div>'
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('is a no-op when the splash element is absent', () => {
    document.body.innerHTML = ''
    expect(() => hideAppSplash()).not.toThrow()
  })

  it('starts the fade-out by adding the is-hidden class', () => {
    hideAppSplash()
    expect(document.getElementById('app-splash')).toHaveClass('is-hidden')
  })

  it('removes the element on transitionend', () => {
    const splash = document.getElementById('app-splash')!
    hideAppSplash()
    splash.dispatchEvent(new Event('transitionend'))
    expect(document.getElementById('app-splash')).toBeNull()
  })

  it('removes the element via the timeout fallback if transitionend never fires', () => {
    hideAppSplash()
    expect(document.getElementById('app-splash')).not.toBeNull()
    vi.advanceTimersByTime(300)
    expect(document.getElementById('app-splash')).toBeNull()
  })
})
