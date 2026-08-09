import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Combobox } from './Combobox'

const OPTIONS = ['GM', 'GMUI', 'OPS']

/** A controlled host, since the field's whole point is that what is typed becomes the value. */
function Harness({
  onChange,
  initial = '',
}: {
  onChange?: (value: string) => void
  initial?: string
}) {
  const [value, setValue] = useState(initial)
  return (
    <Combobox
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
      options={OPTIONS}
      normalize={(raw) => raw.toUpperCase()}
      freeValueLabel={(v) => `New prefix "${v}"`}
      emptyLabel="Nothing to suggest"
      placeholder="Prefix"
      aria-label="Prefix"
      testId="prefix"
    />
  )
}

describe('Combobox', () => {
  it('offers every option when the field is clicked', async () => {
    render(<Harness />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('prefix-input'))

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(OPTIONS)
  })

  it('still offers the others once one is selected', async () => {
    render(<Harness initial="GM" />)

    await userEvent.click(screen.getByTestId('prefix-input'))

    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('narrows the list to what was typed', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByTestId('prefix-input'), 'gmu')

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['GMUI'])
  })

  it('takes the typed value, normalized, over any suggestion', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await userEvent.type(screen.getByTestId('prefix-input'), 'abc')

    expect(onChange).toHaveBeenLastCalledWith('ABC')
    expect(screen.getByTestId('prefix-input')).toHaveValue('ABC')
  })

  it('says a value matching no option will be a new one', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByTestId('prefix-input'), 'ABC')

    expect(screen.getByText('New prefix "ABC"')).toBeInTheDocument()
  })

  it('does not call a typed value new once it matches an option', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByTestId('prefix-input'), 'GM')

    expect(screen.queryByTestId('prefix-free-value')).not.toBeInTheDocument()
  })

  it('picks the option that was clicked', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await userEvent.click(screen.getByTestId('prefix-input'))
    await userEvent.click(screen.getByTestId('prefix-option-GMUI'))

    expect(onChange).toHaveBeenCalledWith('GMUI')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('picks the highlighted option with the keyboard', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    await userEvent.click(screen.getByTestId('prefix-input'))
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledWith('GMUI')
  })

  it('closes on Escape without touching the typed value', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByTestId('prefix-input'), 'AB')
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('prefix-input')).toHaveValue('AB')
  })

  it('closes when the pointer goes elsewhere', async () => {
    render(
      <>
        <Harness />
        <button type="button">Elsewhere</button>
      </>
    )

    await userEvent.click(screen.getByTestId('prefix-input'))
    await userEvent.click(screen.getByText('Elsewhere'))

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('offers nothing when it is disabled', async () => {
    render(
      <Combobox
        value=""
        onChange={vi.fn()}
        options={OPTIONS}
        disabled
        testId="prefix"
        aria-label="Prefix"
      />
    )

    await userEvent.click(screen.getByTestId('prefix-input'))

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('says so when there is nothing to suggest', async () => {
    render(
      <Combobox
        value=""
        onChange={vi.fn()}
        options={[]}
        emptyLabel="Nothing to suggest"
        testId="prefix"
        aria-label="Prefix"
      />
    )

    await userEvent.click(screen.getByTestId('prefix-input'))

    expect(screen.getByText('Nothing to suggest')).toBeInTheDocument()
  })
})
