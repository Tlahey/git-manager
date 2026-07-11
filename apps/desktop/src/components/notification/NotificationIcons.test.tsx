import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  ReviewRequestedIcon,
  PrGreenIcon,
  PrRedIcon,
  PrMergedIcon,
  PrClosedIcon,
  NewPrIcon,
  DefaultIcon,
} from './NotificationIcons'

// Every export here is a static presentational icon with no props and no branches — a plain
// smoke test (renders, contains exactly one <svg>) is the right amount of coverage; there's no
// conditional logic or edge case to exercise beyond "does this render without throwing".
describe.each([
  ['ReviewRequestedIcon', ReviewRequestedIcon],
  ['PrGreenIcon', PrGreenIcon],
  ['PrRedIcon', PrRedIcon],
  ['PrMergedIcon', PrMergedIcon],
  ['PrClosedIcon', PrClosedIcon],
  ['NewPrIcon', NewPrIcon],
  ['DefaultIcon', DefaultIcon],
] as const)('%s', (_name, Icon) => {
  it('renders exactly one svg icon', () => {
    const { container } = render(<Icon />)
    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })
})
