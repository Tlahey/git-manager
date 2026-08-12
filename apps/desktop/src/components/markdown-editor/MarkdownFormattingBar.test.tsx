import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MARKDOWN_COMMANDS } from '@git-manager/components'
import { renderWithLanguage } from '../../test/i18n'
import { MarkdownFormattingBar } from './MarkdownFormattingBar'

describe('MarkdownFormattingBar', () => {
  it('labels its buttons with real copy, not raw keys', () => {
    render(<MarkdownFormattingBar onCommand={vi.fn()} />)

    expect(screen.getByLabelText('Bold')).toBeInTheDocument()
    expect(screen.getByLabelText('Bulleted list')).toBeInTheDocument()
  })

  it('translates the labels', () => {
    renderWithLanguage(<MarkdownFormattingBar onCommand={vi.fn()} />, 'fr')

    expect(screen.getByLabelText('Gras')).toBeInTheDocument()
  })

  it('has a translation for every command in the registry', () => {
    render(<MarkdownFormattingBar onCommand={vi.fn()} />)

    const labelled = screen.getAllByLabelText(/.+/).map((element) => element.ariaLabel)
    expect(labelled.some((label) => label?.startsWith('markdown.'))).toBe(false)
    expect(Object.keys(MARKDOWN_COMMANDS).length).toBeGreaterThan(0)
  })

  it('forwards the picked command', async () => {
    const onCommand = vi.fn()
    render(<MarkdownFormattingBar onCommand={onCommand} />)

    await userEvent.click(screen.getByTestId('markdown-toolbar-quote'))

    expect(onCommand).toHaveBeenCalledWith('quote')
  })
})
