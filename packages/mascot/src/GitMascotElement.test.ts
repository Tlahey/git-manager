import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const detach = vi.fn()
const attachEyeTracking = vi.fn((_svg: SVGSVGElement) => detach)
vi.mock('./behaviors', () => ({ attachEyeTracking: (...args: [SVGSVGElement]) => attachEyeTracking(...args) }))

import { GitMascotElement, defineGitMascot } from './GitMascotElement'

function mount(attrs: Record<string, string> = {}): GitMascotElement {
  defineGitMascot()
  const el = document.createElement('git-mascot') as GitMascotElement
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.appendChild(el)
  return el
}

beforeEach(() => {
  attachEyeTracking.mockClear()
  detach.mockClear()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('defineGitMascot', () => {
  it('registers the git-mascot custom element', () => {
    defineGitMascot()
    expect(customElements.get('git-mascot')).toBe(GitMascotElement)
  })

  it('is idempotent — calling it again does not throw or re-register', () => {
    defineGitMascot()
    expect(() => defineGitMascot()).not.toThrow()
    expect(customElements.get('git-mascot')).toBe(GitMascotElement)
  })
})

describe('connectedCallback', () => {
  it('renders a shadow root containing the mascot SVG and its styles', () => {
    const el = mount()
    expect(el.shadowRoot).not.toBeNull()
    expect(el.shadowRoot!.querySelector('style')?.textContent).toContain('gm-wave')
    expect(el.shadowRoot!.querySelector('svg')).not.toBeNull()
  })

  it('defaults the aria-label and size when no attributes are given', () => {
    const el = mount()
    const svg = el.shadowRoot!.querySelector('svg')!
    expect(svg.getAttribute('aria-label')).toBe('Git Manager octopus mascot')
    expect(el.style.getPropertyValue('--gm-size')).toBe('320px')
  })

  it('applies a custom size and label', () => {
    const el = mount({ size: '480', label: 'Custom mascot' })
    const svg = el.shadowRoot!.querySelector('svg')!
    expect(el.style.getPropertyValue('--gm-size')).toBe('480px')
    expect(svg.getAttribute('aria-label')).toBe('Custom mascot')
  })

  it('attaches eye tracking by default', () => {
    mount()
    expect(attachEyeTracking).toHaveBeenCalledOnce()
  })

  it('does not mark the svg as static by default', () => {
    const el = mount()
    const svg = el.shadowRoot!.querySelector('svg')!
    expect(svg.hasAttribute('data-static')).toBe(false)
  })

  it('marks the svg as static and skips eye tracking when animated="false"', () => {
    const el = mount({ animated: 'false' })
    const svg = el.shadowRoot!.querySelector('svg')!
    expect(svg.hasAttribute('data-static')).toBe(true)
    expect(attachEyeTracking).not.toHaveBeenCalled()
  })

  it('skips eye tracking when eye-tracking="false", even while animated', () => {
    mount({ 'eye-tracking': 'false' })
    expect(attachEyeTracking).not.toHaveBeenCalled()
  })
})

describe('attributeChangedCallback', () => {
  it('re-syncs size when the attribute changes after connection', () => {
    const el = mount()
    el.setAttribute('size', '200')
    expect(el.style.getPropertyValue('--gm-size')).toBe('200px')
  })

  it('detaches eye tracking when animated is toggled off after connection', () => {
    const el = mount()
    expect(attachEyeTracking).toHaveBeenCalledOnce()
    el.setAttribute('animated', 'false')
    expect(detach).toHaveBeenCalledOnce()
  })

  it('re-attaches eye tracking when animated is toggled back on', () => {
    const el = mount({ animated: 'false' })
    expect(attachEyeTracking).not.toHaveBeenCalled()
    el.setAttribute('animated', 'true')
    expect(attachEyeTracking).toHaveBeenCalledOnce()
  })

  it('does not re-attach eye tracking on an unrelated attribute change while already tracking', () => {
    const el = mount()
    expect(attachEyeTracking).toHaveBeenCalledOnce()
    el.setAttribute('label', 'Something else')
    expect(attachEyeTracking).toHaveBeenCalledOnce()
  })
})

describe('disconnectedCallback', () => {
  it('detaches eye tracking when removed from the DOM', () => {
    const el = mount()
    expect(attachEyeTracking).toHaveBeenCalledOnce()
    el.remove()
    expect(detach).toHaveBeenCalledOnce()
  })

  it('is safe to call when eye tracking was never attached', () => {
    const el = mount({ animated: 'false' })
    expect(() => el.remove()).not.toThrow()
    expect(detach).not.toHaveBeenCalled()
  })
})
