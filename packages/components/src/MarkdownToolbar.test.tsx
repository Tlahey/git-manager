import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarkdownToolbar } from './MarkdownToolbar'
import { MARKDOWN_COMMANDS } from './markdownCommands'
import type { MarkdownCommandId } from './markdownCommands'
import type { MarkdownToolbarLabels } from './markdownToolbar.config'

/** Labels are the app's job; the package only needs one per command to render. */
const labels: MarkdownToolbarLabels = {
  commands: Object.fromEntries(
    Object.keys(MARKDOWN_COMMANDS).map((command) => [command, command])
  ) as Record<MarkdownCommandId, string>,
  headings: 'Heading',
  alerts: 'Alert',
  more: 'More',
  sections: { text: 'Text', blocks: 'Blocks', inserts: 'Insert' },
}

function setUp() {
  const onCommand = vi.fn()
  render(<MarkdownToolbar onCommand={onCommand} labels={labels} />)
  return onCommand
}

describe('MarkdownToolbar', () => {
  it('runs the command behind a bar button', async () => {
    const onCommand = setUp()

    await userEvent.click(screen.getByTestId('markdown-toolbar-bold'))

    expect(onCommand).toHaveBeenCalledWith('bold')
  })

  it('keeps the field focused by cancelling the pointer-down default', async () => {
    setUp()
    const button = screen.getByTestId('markdown-toolbar-bold')

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    button.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('opens the heading menu and runs the level picked', async () => {
    const onCommand = setUp()

    await userEvent.click(screen.getByTestId('markdown-toolbar-headings'))
    await userEvent.click(await screen.findByTestId('markdown-toolbar-heading3'))

    expect(onCommand).toHaveBeenCalledWith('heading3')
  })

  it('offers the five GitHub alerts', async () => {
    const onCommand = setUp()

    await userEvent.click(screen.getByTestId('markdown-toolbar-alerts'))

    expect(await screen.findByTestId('markdown-toolbar-alertCaution')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('markdown-toolbar-alertWarning'))
    expect(onCommand).toHaveBeenCalledWith('alertWarning')
  })

  it('keeps the rarer syntax reachable under the overflow menu', async () => {
    const onCommand = setUp()

    await userEvent.click(screen.getByTestId('markdown-toolbar-more'))

    expect(await screen.findByText('Blocks')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('markdown-toolbar-footnote'))
    expect(onCommand).toHaveBeenCalledWith('footnote')
  })

  it('disables every button while the editor is saving', () => {
    render(<MarkdownToolbar onCommand={vi.fn()} labels={labels} disabled />)

    expect(screen.getByTestId('markdown-toolbar-bold')).toBeDisabled()
  })
})
