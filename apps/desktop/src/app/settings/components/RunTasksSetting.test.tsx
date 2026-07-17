import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../../hooks/useProjectCommands', () => ({ useProjectCommands: () => [] }))

import { useSettingsStore } from '../../../stores/settings.store'
import { RunTasksSetting } from './RunTasksSetting'

const DEFAULT_SETTINGS = useSettingsStore.getState().settings

function override() {
  return useSettingsStore.getState().settings.repoOverrides['/repo']
}

beforeEach(() => {
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS })
})

async function addSavedTask(user: ReturnType<typeof userEvent.setup>, name: string, cmd: string) {
  await user.click(screen.getByTestId('run-tasks-add'))
  await user.type(screen.getByTestId('run-tasks-name'), name)
  await user.type(screen.getByTestId('run-tasks-command'), cmd)
  await user.click(screen.getByTestId('run-tasks-save'))
}

describe('RunTasksSetting', () => {
  it('shows the empty state and starts an editing row on add (nothing saved yet)', async () => {
    const user = userEvent.setup()
    render(<RunTasksSetting repoPath="/repo" />)
    expect(screen.getByTestId('run-tasks-empty')).toBeInTheDocument()

    await user.click(screen.getByTestId('run-tasks-add'))
    expect(screen.getByTestId('run-tasks-name')).toBeInTheDocument()
    // No save affordance and no persisted task until both fields are filled.
    expect(screen.queryByTestId('run-tasks-save')).not.toBeInTheDocument()
    expect(override()).toBeUndefined()
  })

  it('persists the task only once name and command are filled and saved', async () => {
    const user = userEvent.setup()
    render(<RunTasksSetting repoPath="/repo" />)
    await addSavedTask(user, 'Dev', 'pnpm dev')

    const tasks = override().runTasks
    expect(tasks).toHaveLength(1)
    expect(tasks?.[0]).toMatchObject({ name: 'Dev', command: 'pnpm dev' })
    // Saved row is now read-only.
    expect(screen.getByTestId('run-tasks-name-value')).toHaveTextContent('Dev')
  })

  it('re-opens a saved task for editing', async () => {
    const user = userEvent.setup()
    render(<RunTasksSetting repoPath="/repo" />)
    await addSavedTask(user, 'Dev', 'pnpm dev')

    await user.click(screen.getByTestId('run-tasks-edit'))
    expect(screen.getByTestId('run-tasks-command')).toHaveValue('pnpm dev')
  })

  it('flags a task as default and deletes it', async () => {
    const user = userEvent.setup()
    render(<RunTasksSetting repoPath="/repo" />)
    await addSavedTask(user, 'Dev', 'pnpm dev')

    const id = override().runTasks![0].id
    await user.click(screen.getByTestId('run-tasks-default'))
    expect(override().defaultRunTaskId).toBe(id)

    await user.click(screen.getByTestId('run-tasks-delete'))
    // Dropping the last task clears the whole override entry.
    expect(override()).toBeUndefined()
  })

  it('pre-fills the name from a preset without saving it', async () => {
    const user = userEvent.setup()
    render(<RunTasksSetting repoPath="/repo" />)
    await user.click(screen.getByTestId('run-tasks-preset-launch'))
    expect(screen.getByTestId('run-tasks-name')).toHaveValue(
      'settings.repository.run.presets.launch'
    )
    expect(override()).toBeUndefined()
  })
})
