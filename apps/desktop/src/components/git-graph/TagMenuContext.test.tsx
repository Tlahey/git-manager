import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitRef } from '@git-manager/git-types'
import { TagMenuProvider, useTagMenuHandler } from './TagMenuContext'

const TAG: GitRef = { name: 'refs/tags/v1', shortName: 'v1', type: 'tag', commitOid: 'abc' }

function Consumer() {
  const handler = useTagMenuHandler()
  return (
    <button onClick={(e) => handler?.(e, TAG)} data-testid="btn">
      {handler ? 'with-handler' : 'no-handler'}
    </button>
  )
}

describe('TagMenuContext', () => {
  it('returns null outside a provider', () => {
    render(<Consumer />)
    expect(screen.getByTestId('btn')).toHaveTextContent('no-handler')
  })

  it('passes the handler down and forwards the event + ref', async () => {
    const handler = vi.fn()
    const user = userEvent.setup()
    render(
      <TagMenuProvider handler={handler}>
        <Consumer />
      </TagMenuProvider>
    )
    await user.click(screen.getByTestId('btn'))
    expect(handler).toHaveBeenCalledWith(expect.anything(), TAG)
  })
})
