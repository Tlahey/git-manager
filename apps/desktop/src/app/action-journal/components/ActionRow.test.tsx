import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionRow } from './ActionRow'
import type { PooledAction, PooledCommand } from '../../../lib/actionPool'

function command(overrides: Partial<PooledCommand> = {}): PooledCommand {
  return {
    entryId: 'e1',
    command: 'stage_file',
    titleKey: 'gitCommand.stageFile',
    family: 'staging',
    lines: ['git add -- a.ts'],
    status: 'ok',
    timestamp: Date.now(),
    durationMs: 4,
    ...overrides,
  }
}

function action(overrides: Partial<PooledAction> = {}): PooledAction {
  return {
    id: 'corr-1',
    titleKey: 'gitCommand.stageFile',
    family: 'staging',
    repoPath: '/Users/me/code/git-manager',
    startTimestamp: Date.now(),
    totalDurationMs: 4,
    status: 'ok',
    commands: [command()],
    ...overrides,
  }
}

describe('ActionRow', () => {
  it('shows the git commands on the row itself, with no model involved', () => {
    // The requirement the window turns on: with no AI configured this list is the whole feature, so
    // it must be readable without opening anything.
    render(
      <ActionRow
        action={action({
          commands: [
            command({ lines: ['git checkout main'], entryId: 'e1' }),
            command({ lines: ['git merge --no-edit feat/x'], entryId: 'e2' }),
          ],
        })}
        selected={false}
        explained={false}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('git checkout main')).toBeInTheDocument()
    expect(screen.getByText('git merge --no-edit feat/x')).toBeInTheDocument()
  })

  it('names the action in the real English copy', () => {
    render(
      <ActionRow action={action()} selected={false} explained={false} onSelect={vi.fn()} />
    )

    expect(screen.getByText('Stage a file')).toBeInTheDocument()
  })

  it('counts the commands only when there is more than one', () => {
    const { rerender } = render(
      <ActionRow action={action()} selected={false} explained={false} onSelect={vi.fn()} />
    )
    expect(screen.queryByText(/commands/)).not.toBeInTheDocument()

    rerender(
      <ActionRow
        action={action({ commands: [command({ entryId: 'e1' }), command({ entryId: 'e2' })] })}
        selected={false}
        explained={false}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText('2 commands')).toBeInTheDocument()
  })

  it('flags a failed action', () => {
    render(
      <ActionRow
        action={action({ status: 'error' })}
        selected={false}
        explained={false}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('marks the rows already explained', () => {
    const { rerender } = render(
      <ActionRow action={action()} selected={false} explained={false} onSelect={vi.fn()} />
    )
    expect(screen.queryByTestId('action-row-explained')).not.toBeInTheDocument()

    rerender(<ActionRow action={action()} selected={false} explained onSelect={vi.fn()} />)
    expect(screen.getByTestId('action-row-explained')).toBeInTheDocument()
  })

  it('shows only the repository name, not its whole path', () => {
    render(<ActionRow action={action()} selected={false} explained={false} onSelect={vi.fn()} />)

    expect(screen.getByText('git-manager')).toBeInTheDocument()
    expect(screen.queryByText('/Users/me/code/git-manager')).not.toBeInTheDocument()
  })

  it('reports its selection to assistive technology', () => {
    const { rerender } = render(
      <ActionRow action={action()} selected={false} explained={false} onSelect={vi.fn()} />
    )
    expect(screen.getByTestId('action-row-corr-1')).not.toHaveAttribute('aria-current')

    rerender(<ActionRow action={action()} selected explained={false} onSelect={vi.fn()} />)
    expect(screen.getByTestId('action-row-corr-1')).toHaveAttribute('aria-current', 'true')
  })

  it('selects on click', () => {
    const onSelect = vi.fn()
    render(<ActionRow action={action()} selected={false} explained={false} onSelect={onSelect} />)

    fireEvent.click(screen.getByTestId('action-row-corr-1'))
    expect(onSelect).toHaveBeenCalledOnce()
  })
})
