import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextMenu, ContextMenuTrigger } from '@git-manager/ui'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { HeaderColumnsMenu } from './HeaderColumnsMenu'
import { useGitGraphColumnsStore } from '../../stores/gitGraphColumns.store'
import { COLUMN_ORDER } from './columns'

const INITIAL = useGitGraphColumnsStore.getState()

function renderMenu() {
  const utils = render(
    <ContextMenu>
      <ContextMenuTrigger>zone</ContextMenuTrigger>
      <HeaderColumnsMenu />
    </ContextMenu>
  )
  fireEvent.contextMenu(screen.getByText('zone'))
  return utils
}

beforeEach(() => {
  useGitGraphColumnsStore.setState(INITIAL, true)
})

describe('HeaderColumnsMenu', () => {
  it('lists every column, checking only the ones visible by default (refs/graph/message)', () => {
    renderMenu()
    for (const key of COLUMN_ORDER) {
      expect(screen.getByText(`gitTree.columns.${key}`)).toBeInTheDocument()
    }
    const itemFor = (key: string) => screen.getByText(`gitTree.columns.${key}`).closest('[role="menuitem"]')!
    expect(itemFor('refs').querySelector('svg')).toBeTruthy()
    expect(itemFor('graph').querySelector('svg')).toBeTruthy()
    expect(itemFor('message').querySelector('svg')).toBeTruthy()
    expect(itemFor('author').querySelector('svg')).toBeFalsy()
    expect(itemFor('date').querySelector('svg')).toBeFalsy()
    expect(itemFor('sha').querySelector('svg')).toBeFalsy()
  })

  it('toggles a hidden-by-default column on when selected', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByText('gitTree.columns.author'))
    expect(useGitGraphColumnsStore.getState().columns.author.visible).toBe(true)
  })

  it('toggles a visible column off when selected', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByText('gitTree.columns.refs'))
    expect(useGitGraphColumnsStore.getState().columns.refs.visible).toBe(false)
  })

  it('disables the toggle for the last remaining visible column', () => {
    useGitGraphColumnsStore.setState({
      columns: Object.fromEntries(COLUMN_ORDER.map((k) => [k, { visible: k === 'message', width: 100 }])) as never,
    })
    renderMenu()
    expect(screen.getByRole('menuitem', { name: /message/ })).toHaveAttribute('data-disabled')
  })
})
