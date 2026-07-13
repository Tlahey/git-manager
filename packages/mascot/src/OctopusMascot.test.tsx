import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { OctopusMascot } from './OctopusMascot'

vi.mock('./behaviors', () => ({ attachEyeTracking: vi.fn(() => vi.fn()) }))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('OctopusMascot', () => {
  it('renders a git-mascot custom element and registers the custom element definition', () => {
    const { container } = render(<OctopusMascot />)
    const el = container.querySelector('git-mascot')
    expect(el).not.toBeNull()
    expect(customElements.get('git-mascot')).toBeDefined()
  })

  it('forwards size/animated/eye-tracking/label as attributes on the underlying element', () => {
    const { container } = render(
      <OctopusMascot size={480} animated={false} eyeTracking={false} label="Custom label" />
    )
    const el = container.querySelector('git-mascot')!
    expect(el.getAttribute('size')).toBe('480')
    expect(el.getAttribute('animated')).toBe('false')
    expect(el.getAttribute('eye-tracking')).toBe('false')
    expect(el.getAttribute('label')).toBe('Custom label')
  })

  it('omits animated/eye-tracking attributes when both are enabled (the element defaults to on)', () => {
    const { container } = render(<OctopusMascot animated eyeTracking />)
    const el = container.querySelector('git-mascot')!
    expect(el.hasAttribute('animated')).toBe(false)
    expect(el.hasAttribute('eye-tracking')).toBe(false)
  })

  it('applies a className and inline style to the underlying element', () => {
    const { container } = render(<OctopusMascot className="my-mascot" style={{ marginTop: 8 }} />)
    const el = container.querySelector('git-mascot') as HTMLElement
    expect(el.className).toBe('my-mascot')
    expect(el.style.marginTop).toBe('8px')
  })

  it('defaults size to 320 and label to the standard accessible name', () => {
    const { container } = render(<OctopusMascot />)
    const el = container.querySelector('git-mascot')!
    expect(el.getAttribute('size')).toBe('320')
    expect(el.getAttribute('label')).toBe('Git Manager octopus mascot')
  })
})
