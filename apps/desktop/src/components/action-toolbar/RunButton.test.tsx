import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RunTask } from '@git-manager/git-types'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { RunButton } from './RunButton'

const TASKS: RunTask[] = [
  { id: 'a', name: 'Launch', command: 'pnpm dev' },
  { id: 'b', name: 'Tests', command: 'pnpm test' },
]

describe('RunButton', () => {
  it('runs the default task when the primary button is clicked', async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()
    render(<RunButton tasks={TASKS} defaultTask={TASKS[1]} onRun={onRun} />)
    await user.click(screen.getByTestId('toolbar-run-button-primary'))
    expect(onRun).toHaveBeenCalledWith(TASKS[1])
  })

  it('lists every task in the dropdown and runs the chosen one', async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()
    render(<RunButton tasks={TASKS} defaultTask={TASKS[0]} onRun={onRun} />)
    await user.click(screen.getByTestId('toolbar-run-button-menu'))
    await user.click(screen.getByTestId('toolbar-run-task-b'))
    expect(onRun).toHaveBeenCalledWith(TASKS[1])
  })
})
