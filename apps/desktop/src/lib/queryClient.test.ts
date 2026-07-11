import { describe, it, expect } from 'vitest'
import { queryClient } from './queryClient'

describe('queryClient', () => {
  it('retries failed queries once', () => {
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(1)
  })

  it('treats query data as fresh for 5 seconds', () => {
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(5_000)
  })
})
