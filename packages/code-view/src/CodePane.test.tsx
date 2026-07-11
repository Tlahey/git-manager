import { lazy } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CodePane, type CodePaneEditorProps } from './CodePane'

function FakeEditor(props: CodePaneEditorProps) {
  return (
    <div data-testid="fake-editor">
      <span data-testid="value">{props.value}</span>
      <span data-testid="language">{props.language}</span>
      <span data-testid="theme">{props.theme}</span>
      <span data-testid="path">{props.path}</span>
      <span data-testid="readonly">{String(props.options?.readOnly)}</span>
      <span data-testid="line-highlight">{props.options?.renderLineHighlight}</span>
      <button data-testid="trigger-change" onClick={() => props.onChange?.('new value')}>
        change
      </button>
      <button data-testid="trigger-change-undefined" onClick={() => props.onChange?.(undefined)}>
        change-undefined
      </button>
    </div>
  )
}

describe('CodePane', () => {
  it('forwards value/language/theme/modelPath to the injected editor component', () => {
    render(
      <CodePane
        value="const x = 1"
        language="typescript"
        theme="git-manager-dark"
        modelPath="file.ts#ours"
        readOnly={false}
        onMount={vi.fn()}
        editorComponent={FakeEditor}
      />
    )
    expect(screen.getByTestId('value')).toHaveTextContent('const x = 1')
    expect(screen.getByTestId('language')).toHaveTextContent('typescript')
    expect(screen.getByTestId('theme')).toHaveTextContent('git-manager-dark')
    expect(screen.getByTestId('path')).toHaveTextContent('file.ts#ours')
  })

  it('always disables the minimap and glyph margin (fixed options, not host-configurable)', () => {
    let captured: CodePaneEditorProps | undefined
    function Capturing(props: CodePaneEditorProps) {
      captured = props
      return null
    }
    render(
      <CodePane value="" modelPath="p" readOnly={false} onMount={vi.fn()} editorComponent={Capturing} />
    )
    expect(captured?.options?.minimap).toEqual({ enabled: false })
    expect(captured?.options?.glyphMargin).toBe(false)
    expect(captured?.options?.scrollBeyondLastLine).toBe(false)
  })

  it('passes readOnly through to editor options and renders line highlight "all" only when editable', () => {
    const { rerender } = render(
      <CodePane value="" modelPath="p" readOnly={true} onMount={vi.fn()} editorComponent={FakeEditor} />
    )
    expect(screen.getByTestId('readonly')).toHaveTextContent('true')
    expect(screen.getByTestId('line-highlight')).toHaveTextContent('none')

    rerender(<CodePane value="" modelPath="p" readOnly={false} onMount={vi.fn()} editorComponent={FakeEditor} />)
    expect(screen.getByTestId('readonly')).toHaveTextContent('false')
    expect(screen.getByTestId('line-highlight')).toHaveTextContent('all')
  })

  it('wraps onChange so an undefined editor value becomes an empty string', async () => {
    const onChange = vi.fn()
    render(<CodePane value="" modelPath="p" readOnly={false} onMount={vi.fn()} onChange={onChange} editorComponent={FakeEditor} />)

    screen.getByTestId('trigger-change').click()
    expect(onChange).toHaveBeenCalledWith('new value')

    screen.getByTestId('trigger-change-undefined').click()
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('leaves onChange undefined for the editor component when the host passes none', () => {
    let captured: CodePaneEditorProps | undefined
    function Capturing(props: CodePaneEditorProps) {
      captured = props
      return null
    }
    render(<CodePane value="" modelPath="p" readOnly={false} onMount={vi.fn()} editorComponent={Capturing} />)
    expect(captured?.onChange).toBeUndefined()
  })

  it('forwards the onMount callback unchanged', () => {
    let captured: CodePaneEditorProps | undefined
    function Capturing(props: CodePaneEditorProps) {
      captured = props
      return null
    }
    const onMount = vi.fn()
    render(<CodePane value="" modelPath="p" readOnly={false} onMount={onMount} editorComponent={Capturing} />)
    expect(captured?.onMount).toBe(onMount)
  })

  it('renders a custom loading fallback while the (lazy) editor component is pending', () => {
    const LazyNeverResolves = lazy(() => new Promise<{ default: (props: CodePaneEditorProps) => null }>(() => {}))
    render(
      <CodePane
        value=""
        modelPath="p"
        readOnly={false}
        onMount={vi.fn()}
        editorComponent={LazyNeverResolves}
        loadingFallback={<div data-testid="custom-loading">custom loading…</div>}
      />
    )
    expect(screen.getByTestId('custom-loading')).toBeInTheDocument()
  })
})
