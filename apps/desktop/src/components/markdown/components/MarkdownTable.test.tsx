import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownTable, MarkdownTableCell, MarkdownTableHead } from './MarkdownTable'

describe('MarkdownTable', () => {
  it('wraps the table in a scroller, so a wide table cannot stretch the whole document', () => {
    render(
      <MarkdownTable>
        <tbody>
          <tr>
            <td>cell</td>
          </tr>
        </tbody>
      </MarkdownTable>
    )

    expect(screen.getByTestId('markdown-table-wrapper').className).toContain('overflow-x-auto')
    expect(screen.getByTestId('markdown-table').tagName).toBe('TABLE')
  })
})

describe('MarkdownTableCell', () => {
  function renderCell(props: React.ComponentProps<typeof MarkdownTableCell>) {
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <MarkdownTableCell {...props} />
          </tr>
        </tbody>
      </table>
    )
    return container.querySelector('td, th') as HTMLElement
  }

  it('renders a data cell by default and a header cell on demand', () => {
    expect(renderCell({ children: 'x' }).tagName).toBe('TD')
    expect(renderCell({ isHeader: true, children: 'x' }).tagName).toBe('TH')
  })

  it('applies each of the three GFM column alignments', () => {
    expect(renderCell({ align: 'left', children: 'x' }).className).toContain('text-left')
    expect(renderCell({ align: 'center', children: 'x' }).className).toContain('text-center')
    expect(renderCell({ align: 'right', children: 'x' }).className).toContain('text-right')
  })

  it('falls back to left for a column with no declared alignment', () => {
    expect(renderCell({ children: 'x' }).className).toContain('text-left')
    expect(renderCell({ align: null, children: 'x' }).className).toContain('text-left')
  })
})

describe('MarkdownTableHead', () => {
  it('renders a thead the table can use', () => {
    const { container } = render(
      <table>
        <MarkdownTableHead>
          <tr>
            <th>h</th>
          </tr>
        </MarkdownTableHead>
      </table>
    )

    expect(container.querySelector('thead')).not.toBeNull()
    expect(screen.getByText('h')).toBeInTheDocument()
  })
})
