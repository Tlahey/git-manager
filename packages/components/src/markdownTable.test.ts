import { describe, it, expect } from 'vitest'
import { parseMarkdownTable } from './markdownTable'

const TABLE = ['| Name | Size |', '| --- | ---: |', '| readme | 2 kB |', '| logo | 40 kB |'].join(
  '\n'
)

describe('parseMarkdownTable', () => {
  it('reads the header and the rows', () => {
    const table = parseMarkdownTable(TABLE)

    expect(table?.header).toEqual(['Name', 'Size'])
    expect(table?.rows).toEqual([
      ['readme', '2 kB'],
      ['logo', '40 kB'],
    ])
  })

  it('reads each column alignment', () => {
    const table = parseMarkdownTable('| a | b | c | d |\n| :-- | --: | :-: | --- |')

    expect(table?.align).toEqual(['left', 'right', 'center', null])
  })

  it('accepts a table without outer pipes', () => {
    const table = parseMarkdownTable('a | b\n--- | ---\n1 | 2')

    expect(table?.header).toEqual(['a', 'b'])
    expect(table?.rows).toEqual([['1', '2']])
  })

  it('keeps an escaped pipe inside its cell', () => {
    const table = parseMarkdownTable('| command |\n| --- |\n| a \\| b |')

    expect(table?.rows).toEqual([['a | b']])
  })

  it('reads a header-only table', () => {
    const table = parseMarkdownTable('| a | b |\n| --- | --- |')

    expect(table?.rows).toEqual([])
  })

  it('rejects a block with no delimiter row', () => {
    expect(parseMarkdownTable('| a | b |\n| 1 | 2 |')).toBeNull()
  })

  it('rejects a single line', () => {
    expect(parseMarkdownTable('| a | b |')).toBeNull()
  })
})
