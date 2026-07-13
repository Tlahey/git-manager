import { describe, it, expect, afterEach } from 'vitest'
import { GitMascotElement, defineGitMascot } from './GitMascotElement'

function mount(attrs: Record<string, string> = {}): GitMascotElement {
  defineGitMascot()
  const el = document.createElement('git-mascot') as GitMascotElement
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.appendChild(el)
  return el
}

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

  it('does not mark the svg as static by default', () => {
    const el = mount()
    const svg = el.shadowRoot!.querySelector('svg')!
    expect(svg.hasAttribute('data-static')).toBe(false)
  })

  it('marks the svg as static when animated="false"', () => {
    const el = mount({ animated: 'false' })
    const svg = el.shadowRoot!.querySelector('svg')!
    expect(svg.hasAttribute('data-static')).toBe(true)
  })
})

describe('attributeChangedCallback', () => {
  it('re-syncs size when the attribute changes after connection', () => {
    const el = mount()
    el.setAttribute('size', '200')
    expect(el.style.getPropertyValue('--gm-size')).toBe('200px')
  })

  it('re-syncs the static flag when animated is toggled after connection', () => {
    const el = mount()
    const svg = el.shadowRoot!.querySelector('svg')!
    el.setAttribute('animated', 'false')
    expect(svg.hasAttribute('data-static')).toBe(true)
    el.setAttribute('animated', 'true')
    expect(svg.hasAttribute('data-static')).toBe(false)
  })
})
