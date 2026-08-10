import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HiddenSectionsMenu } from './HiddenSectionsMenu'
import { useDashboardStore } from '../stores/dashboard.store'

const TITLES = {
  open: 'Open repositories',
  favorites: 'Favorites',
  recent: 'Recent repositories',
  all: 'All repositories',
}

beforeEach(() => {
  useDashboardStore.setState({ collapsedSections: {}, hiddenSections: {}, sectionColors: {} })
})

describe('HiddenSectionsMenu', () => {
  it('stays out of the way while nothing is hidden', () => {
    const { container } = render(<HiddenSectionsMenu titles={TITLES} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('appears with a count once a section is hidden', () => {
    useDashboardStore.setState({ hiddenSections: { recent: true, all: true } })
    render(<HiddenSectionsMenu titles={TITLES} />)
    expect(screen.getByTestId('dashboard-hidden-sections')).toHaveTextContent('2')
  })

  it('lists the hidden sections by name', async () => {
    useDashboardStore.setState({ hiddenSections: { recent: true } })
    const user = userEvent.setup()
    render(<HiddenSectionsMenu titles={TITLES} />)
    await user.click(screen.getByTestId('dashboard-hidden-sections'))
    expect(await screen.findByText('Recent repositories')).toBeInTheDocument()
    expect(screen.queryByText('Favorites')).toBeNull()
  })

  it('restores one section', async () => {
    useDashboardStore.setState({ hiddenSections: { recent: true, all: true } })
    const user = userEvent.setup()
    render(<HiddenSectionsMenu titles={TITLES} />)
    await user.click(screen.getByTestId('dashboard-hidden-sections'))
    await user.click(await screen.findByTestId('dashboard-restore-section-recent'))

    expect(useDashboardStore.getState().hiddenSections).toEqual({ all: true })
  })

  it('restores every section at once', async () => {
    useDashboardStore.setState({ hiddenSections: { recent: true, all: true } })
    const user = userEvent.setup()
    render(<HiddenSectionsMenu titles={TITLES} />)
    await user.click(screen.getByTestId('dashboard-hidden-sections'))
    await user.click(await screen.findByTestId('dashboard-restore-all-sections'))

    expect(useDashboardStore.getState().hiddenSections).toEqual({})
  })

  it('disappears again once the last hidden section is restored', async () => {
    useDashboardStore.setState({ hiddenSections: { recent: true } })
    const user = userEvent.setup()
    render(<HiddenSectionsMenu titles={TITLES} />)
    await user.click(screen.getByTestId('dashboard-hidden-sections'))
    await user.click(await screen.findByTestId('dashboard-restore-section-recent'))

    expect(screen.queryByTestId('dashboard-hidden-sections')).toBeNull()
  })
})
