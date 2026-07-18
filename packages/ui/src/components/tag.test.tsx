import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tag } from './tag'

describe('Tag', () => {
  it('renders its children', () => {
    render(<Tag>+3</Tag>)
    expect(screen.getByText('+3')).toBeInTheDocument()
  })

  it('defaults to the neutral tone', () => {
    render(<Tag data-testid="t">x</Tag>)
    expect(screen.getByTestId('t').className).toContain('text-muted-foreground')
  })

  it.each([
    // The tone *text* rides the --tone-*-foreground component tokens so its shade
    // adapts per surface for AA (see tag.tsx / themes.css); the fill stays a /15 tint.
    ['success', 'text-tone-success'],
    ['warning', 'text-tone-warning'],
    ['danger', 'text-tone-danger'],
    ['info', 'text-tone-info'],
  ] as const)('applies the %s tone with an accessible colour', (tone, cls) => {
    render(
      <Tag data-testid="t" tone={tone}>
        x
      </Tag>
    )
    expect(screen.getByTestId('t').className).toContain(cls)
  })

  it('drops the washed-out 500-weight text colours the file tags used', () => {
    // Regression: bg-yellow-500/10 text-yellow-500 was unreadable on light themes.
    render(
      <Tag data-testid="t" tone="warning">
        ~1
      </Tag>
    )
    expect(screen.getByTestId('t').className).not.toContain('text-yellow-500')
  })

  it('merges a custom className', () => {
    render(
      <Tag data-testid="t" className="px-1 text-[9px]">
        x
      </Tag>
    )
    expect(screen.getByTestId('t').className).toContain('px-1')
  })
})
