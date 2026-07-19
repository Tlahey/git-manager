import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { AgentLogo, agentColor, agentLabel } from './AgentLogo'

describe('agentColor', () => {
  it('returns each known agent brand accent', () => {
    expect(agentColor('claude')).toBe('#D97757')
    expect(agentColor('gpt')).toBe('#10A37F')
    expect(agentColor('gemini')).toBe('#4285F4')
  })

  it('falls back to the muted-foreground token for an unknown agent', () => {
    expect(agentColor('nope')).toBe('hsl(var(--muted-foreground))')
  })
})

describe('agentLabel', () => {
  it('maps known agents to display names', () => {
    expect(agentLabel('claude')).toBe('Claude')
    expect(agentLabel('gpt')).toBe('GPT')
  })

  it('falls back to a generic label for an unknown agent', () => {
    expect(agentLabel('whatever')).toBe('Agent')
  })
})

describe('AgentLogo', () => {
  it('renders the dedicated Claude burst glyph (12 rays)', () => {
    const { container } = render(<AgentLogo agent="claude" size={20} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.querySelectorAll('line')).toHaveLength(12)
  })

  it('falls back to a generic icon for an agent without a dedicated glyph', () => {
    const { container } = render(<AgentLogo agent="grok" size={20} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    // The fallback is a plain icon, not the multi-ray Claude burst.
    expect(svg?.querySelectorAll('line')).toHaveLength(0)
  })
})
