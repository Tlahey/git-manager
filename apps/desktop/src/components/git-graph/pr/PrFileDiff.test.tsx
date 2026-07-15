import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@git-manager/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { PrFileDiff } from './PrFileDiff'

describe('PrFileDiff', () => {
  it('renders the parsed hunk lines', () => {
    const patch = ['@@ -1,2 +1,2 @@', ' keep', '-old', '+new'].join('\n')
    render(<PrFileDiff patch={patch} status="modified" />)
    const diff = screen.getByTestId('pr-file-diff')
    expect(diff).toHaveTextContent('keep')
    expect(diff).toHaveTextContent('old')
    expect(diff).toHaveTextContent('new')
    expect(diff).toHaveTextContent('@@ -1,2 +1,2 @@')
  })

  it('shows an empty state when there is no patch', () => {
    render(<PrFileDiff patch={undefined} status="modified" />)
    expect(screen.getByTestId('pr-file-diff-empty')).toHaveTextContent('pr.diff.noPatch')
  })

  it('explains a renamed-only file has no patch', () => {
    render(<PrFileDiff patch={undefined} status="renamed" />)
    expect(screen.getByTestId('pr-file-diff-empty')).toHaveTextContent('pr.diff.renamedOnly')
  })
})
