import { describe, it, expect } from 'vitest'
import { MARKDOWN_COMMANDS, MARKDOWN_SHORTCUTS, type MarkdownCommandId } from './markdownCommands'
import { applyEdit, type MarkdownSelection } from './markdownEdit'

function run(
  id: MarkdownCommandId,
  value: string,
  start = 0,
  end = start
): MarkdownSelection | null {
  const state = { value, selectionStart: start, selectionEnd: end }
  const edit = MARKDOWN_COMMANDS[id](state)
  return edit ? applyEdit(state, edit) : null
}

/** The text of the selection a command left behind — what the user would type over. */
function selected(result: MarkdownSelection | null): string {
  return result ? result.value.slice(result.selectionStart, result.selectionEnd) : ''
}

describe('inline styles', () => {
  it('wraps and unwraps bold', () => {
    expect(run('bold', 'word', 0, 4)?.value).toBe('**word**')
    expect(run('bold', '**word**', 2, 6)?.value).toBe('word')
  })

  it('uses underscores for italic so it never collides with bold markers', () => {
    expect(run('italic', 'word', 0, 4)?.value).toBe('_word_')
    expect(run('italic', '**word**', 0, 8)?.value).toBe('_**word**_')
  })

  it('wraps the HTML-only styles', () => {
    expect(run('underline', 'word', 0, 4)?.value).toBe('<ins>word</ins>')
    expect(run('subscript', 'word', 0, 4)?.value).toBe('<sub>word</sub>')
    expect(run('superscript', 'word', 0, 4)?.value).toBe('<sup>word</sup>')
  })
})

describe('headings', () => {
  it('sets a heading on the touched line', () => {
    expect(run('heading2', 'Title', 2)?.value).toBe('## Title')
  })

  it('clears the heading when applied at its own level', () => {
    expect(run('heading2', '## Title', 4)?.value).toBe('Title')
  })

  it('replaces another level instead of stacking markers', () => {
    expect(run('heading3', '## Title', 4)?.value).toBe('### Title')
  })
})

describe('lists', () => {
  it('toggles a bullet list', () => {
    expect(run('bulletList', 'one\ntwo', 0, 7)?.value).toBe('- one\n- two')
    expect(run('bulletList', '- one\n- two', 0, 11)?.value).toBe('one\ntwo')
  })

  it('numbers an ordered list from one', () => {
    expect(run('numberedList', 'one\ntwo\nthree', 0, 13)?.value).toBe('1. one\n2. two\n3. three')
  })

  it('renumbers instead of stacking when the block is already numbered', () => {
    expect(run('numberedList', '5. one\n9. two', 0, 13)?.value).toBe('one\ntwo')
  })

  it('toggles a task list', () => {
    expect(run('taskList', 'ship it', 0, 7)?.value).toBe('- [ ] ship it')
  })
})

describe('alerts', () => {
  it('quotes the block under a marker', () => {
    expect(run('alertNote', 'careful\nhere', 0, 12)?.value).toBe('> [!NOTE]\n> careful\n> here')
  })

  it('swaps the kind instead of nesting a second quote', () => {
    expect(run('alertWarning', '> [!NOTE]\n> careful', 0, 19)?.value).toBe(
      '> [!WARNING]\n> careful'
    )
  })
})

describe('links and media', () => {
  it('selects the url placeholder when text is selected', () => {
    const result = run('link', 'the docs', 0, 8)
    expect(result?.value).toBe('[the docs](url)')
    expect(selected(result)).toBe('url')
  })

  it('puts the caret in the label when the selection is a url', () => {
    const result = run('link', 'https://example.com', 0, 19)
    expect(result?.value).toBe('[](https://example.com)')
    expect(result?.selectionStart).toBe(1)
  })

  it('prefixes an image with a bang', () => {
    expect(run('image', 'https://example.com/a.png', 0, 25)?.value).toBe(
      '![](https://example.com/a.png)'
    )
  })
})

describe('blocks', () => {
  it('fences a code block around the selection', () => {
    expect(run('codeBlock', 'const a = 1', 0, 11)?.value).toBe('```\nconst a = 1\n```\n')
  })

  it('seeds a mermaid diagram with a template', () => {
    expect(run('mermaid', '', 0)?.value).toContain('```mermaid\nflowchart TD')
  })

  it('selects the first cell of a new table', () => {
    expect(selected(run('table', '', 0))).toBe('Column')
  })

  it('selects the summary of a collapsible section', () => {
    expect(selected(run('details', '', 0))).toBe('Summary')
  })

  it('opens an empty math block with the caret inside', () => {
    const result = run('math', '', 0)
    expect(result?.value).toBe('$$\n\n$$\n')
    expect(result?.selectionStart).toBe(3)
  })
})

describe('footnote', () => {
  it('inserts the marker at the caret and its definition at the end', () => {
    expect(run('footnote', 'A claim.\n', 7)?.value).toBe('A claim[^1].\n\n[^1]: ')
  })

  it('takes the next free number', () => {
    expect(run('footnote', 'One[^1].\n\n[^1]: source\n', 7)?.value).toContain('[^2]')
  })

  it('leaves the caret in the definition it just opened', () => {
    const result = run('footnote', 'A claim.\n', 7)
    expect(result?.selectionStart).toBe(result?.value.length)
  })
})

describe('escape', () => {
  it('backslash-escapes markdown punctuation', () => {
    expect(run('escape', 'a *b* c', 2, 5)?.value).toBe('a \\*b\\* c')
  })

  it('does nothing without a selection', () => {
    expect(run('escape', 'text', 2)).toBeNull()
  })
})

describe('insertions', () => {
  it('opens a mention, a reference and an emoji', () => {
    expect(run('mention', '', 0)?.value).toBe('@')
    expect(run('issueReference', '', 0)?.value).toBe('#')
    expect(selected(run('emoji', '', 0))).toBe('tada')
  })

  it('leaves the caret inside a hidden comment', () => {
    const result = run('hiddenComment', '', 0)
    expect(result?.value).toBe('<!--  -->')
    expect(result?.selectionStart).toBe(5)
  })
})

describe('shortcuts', () => {
  it('binds every shortcut to a command that exists', () => {
    for (const id of Object.values(MARKDOWN_SHORTCUTS)) {
      expect(MARKDOWN_COMMANDS[id]).toBeTypeOf('function')
    }
  })
})
