import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { SWRConfig } from 'swr'

const apiGetPrTemplate = vi.fn()
vi.mock('../api/repo.api', () => ({ apiGetPrTemplate: (...a: unknown[]) => apiGetPrTemplate(...a) }))

import { usePrTemplate } from './usePrTemplate'

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0 } }, children)

beforeEach(() => {
  apiGetPrTemplate.mockReset()
})

describe('usePrTemplate', () => {
  it('does not fetch without a repo path', () => {
    renderHook(() => usePrTemplate(null), { wrapper })
    expect(apiGetPrTemplate).not.toHaveBeenCalled()
  })

  it('returns the detected template', async () => {
    apiGetPrTemplate.mockResolvedValue({ kind: 'single', source: 'x', content: 'y' })
    const { result } = renderHook(() => usePrTemplate('/repo'), { wrapper })
    await waitFor(() => expect(result.current.template).toEqual({ kind: 'single', source: 'x', content: 'y' }))
    expect(apiGetPrTemplate).toHaveBeenCalledWith('/repo')
  })
})
