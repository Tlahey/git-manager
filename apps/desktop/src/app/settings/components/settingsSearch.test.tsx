import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FilterableSetting, Highlight, SettingsSearchProvider } from './settingsSearch'

describe('FilterableSetting', () => {
  it('shows every setting when there is no query', () => {
    render(
      <SettingsSearchProvider query="">
        <FilterableSetting match="terminal colours" testId="a">
          <span>A</span>
        </FilterableSetting>
        <FilterableSetting match="theme" testId="b">
          <span>B</span>
        </FilterableSetting>
      </SettingsSearchProvider>
    )
    expect(screen.getByTestId('a')).toBeInTheDocument()
    expect(screen.getByTestId('b')).toBeInTheDocument()
  })

  it('hides settings whose match text does not contain the query', () => {
    render(
      <SettingsSearchProvider query="terminal">
        <FilterableSetting match="integrated terminal colours" testId="a">
          <span>A</span>
        </FilterableSetting>
        <FilterableSetting match="theme colours" testId="b">
          <span>B</span>
        </FilterableSetting>
      </SettingsSearchProvider>
    )
    expect(screen.getByTestId('a')).toBeInTheDocument()
    expect(screen.queryByTestId('b')).not.toBeInTheDocument()
  })

  it('renders children when used with no provider (default empty query)', () => {
    render(
      <FilterableSetting match="anything" testId="a">
        <span>A</span>
      </FilterableSetting>
    )
    expect(screen.getByTestId('a')).toBeInTheDocument()
  })
})

describe('Highlight', () => {
  it('marks the matched portion of the text', () => {
    const { container } = render(
      <SettingsSearchProvider query="term">
        <Highlight text="Terminal" />
      </SettingsSearchProvider>
    )
    const mark = container.querySelector('mark')
    expect(mark).toHaveTextContent('Term')
    expect(container).toHaveTextContent('Terminal')
  })

  it('renders plain text when there is no query', () => {
    const { container } = render(
      <SettingsSearchProvider query="">
        <Highlight text="Terminal" />
      </SettingsSearchProvider>
    )
    expect(container.querySelector('mark')).toBeNull()
    expect(container).toHaveTextContent('Terminal')
  })
})
