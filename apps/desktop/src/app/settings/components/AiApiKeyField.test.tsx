import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { apiHasCredential, apiStoreCredential, apiDeleteCredential } = vi.hoisted(() => ({
  apiHasCredential: vi.fn().mockResolvedValue(false),
  apiStoreCredential: vi.fn().mockResolvedValue(undefined),
  apiDeleteCredential: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../../api/credentials.api', () => ({
  apiHasCredential,
  apiStoreCredential,
  apiDeleteCredential,
}))

import { AiApiKeyField } from './AiApiKeyField'

beforeEach(() => {
  vi.clearAllMocks()
  apiHasCredential.mockResolvedValue(false)
  apiStoreCredential.mockResolvedValue(undefined)
  apiDeleteCredential.mockResolvedValue(undefined)
})

describe('AiApiKeyField', () => {
  /**
   * The shape that follows from the keychain being write-only: there is no value to bind, so the
   * input starts empty even when a key is stored. Prefilling one would require the read this whole
   * arrangement exists to prevent, and showing a fake row of dots as the value would be a lie.
   */
  it('never prefills the input, even when a key is stored', async () => {
    apiHasCredential.mockResolvedValue(true)
    render(<AiApiKeyField />)

    await screen.findByTestId('ai-api-key-stored')
    expect(screen.getByTestId('ai-api-key-input')).toHaveValue('')
    expect(apiHasCredential).toHaveBeenCalledWith('ai')
  })

  it('says nothing is stored, and offers no way to clear, when there is no key', async () => {
    render(<AiApiKeyField />)
    await waitFor(() => expect(apiHasCredential).toHaveBeenCalled())
    expect(screen.queryByTestId('ai-api-key-stored')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ai-api-key-clear-button')).not.toBeInTheDocument()
  })

  /** Written on blur, not per keystroke: every write is a keychain call, and on an unsigned build
   * macOS may prompt for access — one prompt per character is not a usable field. */
  it('stores the key when the field loses focus, not on every keystroke', async () => {
    const user = userEvent.setup()
    render(
      <>
        <AiApiKeyField />
        <button>elsewhere</button>
      </>
    )

    await user.type(screen.getByTestId('ai-api-key-input'), 'sk-test')
    expect(apiStoreCredential).not.toHaveBeenCalled()

    await user.click(screen.getByText('elsewhere'))
    expect(apiStoreCredential).toHaveBeenCalledWith('ai', 'sk-test')
    await screen.findByText('Saved to your keychain.')
  })

  it('clears the typed value once it is stored, so it is not left on screen', async () => {
    const user = userEvent.setup()
    render(
      <>
        <AiApiKeyField />
        <button>elsewhere</button>
      </>
    )
    await user.type(screen.getByTestId('ai-api-key-input'), 'sk-test')
    await user.click(screen.getByText('elsewhere'))
    await waitFor(() => expect(screen.getByTestId('ai-api-key-input')).toHaveValue(''))
  })

  it('does not write an empty or whitespace-only value', async () => {
    const user = userEvent.setup()
    render(
      <>
        <AiApiKeyField />
        <button>elsewhere</button>
      </>
    )
    await user.type(screen.getByTestId('ai-api-key-input'), '   ')
    await user.click(screen.getByText('elsewhere'))
    expect(apiStoreCredential).not.toHaveBeenCalled()
  })

  it('removes the stored key, and stops saying one is stored', async () => {
    apiHasCredential.mockResolvedValue(true)
    const user = userEvent.setup()
    render(<AiApiKeyField />)

    await user.click(await screen.findByTestId('ai-api-key-clear-button'))

    expect(apiDeleteCredential).toHaveBeenCalledWith('ai')
    await waitFor(() => expect(screen.queryByTestId('ai-api-key-stored')).not.toBeInTheDocument())
  })

  /** A keychain that refuses must say so here: the key is otherwise silently not saved, and the
   * next AI call fails somewhere far away with a 401 the user cannot connect to this field. */
  it('surfaces a keychain failure instead of pretending the key was saved', async () => {
    apiStoreCredential.mockRejectedValue(new Error('keychain locked'))
    const user = userEvent.setup()
    render(
      <>
        <AiApiKeyField />
        <button>elsewhere</button>
      </>
    )

    await user.type(screen.getByTestId('ai-api-key-input'), 'sk-test')
    await user.click(screen.getByText('elsewhere'))

    expect(await screen.findByTestId('ai-api-key-error')).toHaveTextContent('keychain locked')
    expect(screen.queryByTestId('ai-api-key-stored')).not.toBeInTheDocument()
  })

  /** An unreachable keychain reads as "no key stored" rather than crashing the settings page. */
  it('degrades to "nothing stored" when the keychain cannot be asked', async () => {
    apiHasCredential.mockRejectedValue(new Error('unavailable'))
    render(<AiApiKeyField />)
    await waitFor(() => expect(apiHasCredential).toHaveBeenCalled())
    expect(screen.queryByTestId('ai-api-key-stored')).not.toBeInTheDocument()
    expect(screen.getByTestId('ai-api-key-input')).toBeInTheDocument()
  })
})
