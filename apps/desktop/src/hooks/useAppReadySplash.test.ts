import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAppReadySplash } from './useAppReadySplash'
import { useRepoUIStore, DASHBOARD_TAB, PULL_REQUESTS_TAB } from '../stores/repoUI.store'
import { useGlobalLoadingStore } from '../stores/globalLoading.store'

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

describe('useAppReadySplash', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app-splash"></div>'
    useGlobalLoadingStore.setState({ active: {} })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('hides the splash right after first paint on a special (dashboard) tab', async () => {
    useRepoUIStore.setState({ activeTab: DASHBOARD_TAB })
    renderHook(() => useAppReadySplash())

    await waitFor(() => expect(document.getElementById('app-splash')).toHaveClass('is-hidden'))
  })

  it('keeps the splash up while a repo tab is still loading, then hides it once loading clears', async () => {
    useRepoUIStore.setState({ activeTab: '/some/repo' })
    const token = useGlobalLoadingStore.getState().begin('Loading history...')

    renderHook(() => useAppReadySplash())
    await nextFrame()

    // Still loading → splash must remain visible.
    expect(document.getElementById('app-splash')).not.toHaveClass('is-hidden')

    act(() => useGlobalLoadingStore.getState().end(token))

    await waitFor(() => expect(document.getElementById('app-splash')).toHaveClass('is-hidden'))
  })

  it('keeps the splash up while the Launchpad tab is still loading', async () => {
    useRepoUIStore.setState({ activeTab: PULL_REQUESTS_TAB })
    const token = useGlobalLoadingStore.getState().begin('Fetching…')

    renderHook(() => useAppReadySplash())
    await nextFrame()

    expect(document.getElementById('app-splash')).not.toHaveClass('is-hidden')

    act(() => useGlobalLoadingStore.getState().end(token))
    await waitFor(() => expect(document.getElementById('app-splash')).toHaveClass('is-hidden'))
  })
})
