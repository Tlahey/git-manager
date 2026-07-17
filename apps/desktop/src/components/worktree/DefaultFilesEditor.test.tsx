import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DefaultFilesEditor } from './DefaultFilesEditor'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('DefaultFilesEditor', () => {
  it('renders an empty hint and no rows when there are no patterns', () => {
    render(<DefaultFilesEditor patterns={[]} onChange={vi.fn()} />)
    expect(screen.getByTestId('default-files-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('default-files-row')).not.toBeInTheDocument()
  })

  it('renders one input row per pattern', () => {
    render(<DefaultFilesEditor patterns={['.env*', 'config/*.local.json']} onChange={vi.fn()} />)
    const inputs = screen.getAllByTestId<HTMLInputElement>('default-files-input')
    expect(inputs.map((i) => i.value)).toEqual(['.env*', 'config/*.local.json'])
  })

  it('appends an empty pattern when "add" is clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<DefaultFilesEditor patterns={['.env']} onChange={onChange} />)
    await user.click(screen.getByTestId('default-files-add'))
    expect(onChange).toHaveBeenCalledWith(['.env', ''])
  })

  it('edits a pattern in place', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<DefaultFilesEditor patterns={['.env']} onChange={onChange} />)
    await user.type(screen.getByTestId('default-files-input'), '*')
    expect(onChange).toHaveBeenLastCalledWith(['.env*'])
  })

  it('removes the row at the clicked index', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<DefaultFilesEditor patterns={['a', 'b']} onChange={onChange} />)
    const removeButtons = screen.getAllByTestId('default-files-remove')
    await user.click(removeButtons[0])
    expect(onChange).toHaveBeenCalledWith(['b'])
  })

  it('shows the match count next to a pattern when provided, and nothing for unknown patterns', () => {
    render(
      <DefaultFilesEditor
        patterns={['.env*', 'unknown/*']}
        onChange={vi.fn()}
        matchCounts={{ '.env*': 2 }}
      />
    )
    const counts = screen.getAllByTestId('default-files-count')
    // Only the pattern present in the map renders a count (the i18n mock echoes the key).
    expect(counts).toHaveLength(1)
    expect(counts[0]).toHaveTextContent('worktree.defaultFiles.matchCount')
  })

  it('disables "add" while any row is still blank (no piling up empty patterns)', () => {
    render(<DefaultFilesEditor patterns={['.env', '']} onChange={vi.fn()} />)
    expect(screen.getByTestId('default-files-add')).toBeDisabled()
  })

  it('flags a zero-match pattern with the destructive style', () => {
    render(
      <DefaultFilesEditor patterns={['nope/*']} onChange={vi.fn()} matchCounts={{ 'nope/*': 0 }} />
    )
    expect(screen.getByTestId('default-files-count')).toHaveClass('text-destructive')
  })

  it('disables every control when disabled', () => {
    render(<DefaultFilesEditor patterns={['.env']} onChange={vi.fn()} disabled />)
    expect(screen.getByTestId('default-files-input')).toBeDisabled()
    expect(screen.getByTestId('default-files-remove')).toBeDisabled()
    expect(screen.getByTestId('default-files-add')).toBeDisabled()
  })
})
