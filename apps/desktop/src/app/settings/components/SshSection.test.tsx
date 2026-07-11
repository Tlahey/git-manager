import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { dialogOpen } = vi.hoisted(() => ({ dialogOpen: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: dialogOpen }))
vi.mock('../../../api/ssh.api', () => ({ apiGenerateSshKey: vi.fn() }))

const { useSshPublicKey } = vi.hoisted(() => ({ useSshPublicKey: vi.fn() }))
vi.mock('../../../hooks/useSshPublicKey', () => ({ useSshPublicKey }))

import { apiGenerateSshKey } from '../../../api/ssh.api'
import { SshSection } from './SshSection'
import { useSettingsStore } from '../../../stores/settings.store'

const mockedGenerateKey = apiGenerateSshKey as unknown as ReturnType<typeof vi.fn>
const INITIAL_SETTINGS = useSettingsStore.getState()

beforeEach(() => {
  vi.clearAllMocks()
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
  useSshPublicKey.mockReturnValue({ data: undefined, error: undefined, mutate: vi.fn() })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SshSection — key paths', () => {
  it('binds the private/public key path inputs', async () => {
    const user = userEvent.setup()
    render(<SshSection />)
    const [privateInput, publicInput] = screen.getAllByRole('textbox')
    await user.clear(privateInput)
    await user.type(privateInput, '~/.ssh/custom')
    expect(useSettingsStore.getState().settings.ssh!.privateKeyPath).toBe('~/.ssh/custom')

    await user.clear(publicInput)
    await user.type(publicInput, '~/.ssh/custom.pub')
    expect(useSettingsStore.getState().settings.ssh!.publicKeyPath).toBe('~/.ssh/custom.pub')
  })

  it('picks a private key file, deriving the matching .pub path, and refreshes after a delay', async () => {
    vi.useFakeTimers()
    const mutate = vi.fn()
    useSshPublicKey.mockReturnValue({ data: undefined, error: undefined, mutate })
    dialogOpen.mockResolvedValue('/Users/me/.ssh/id_ed25519')
    render(<SshSection />)
    // userEvent's internal delay() calls hang under fake timers without an `advanceTimers`
    // option wired up — use fireEvent (synchronous) instead for this fake-timers test.
    await act(async () => {
      fireEvent.click(screen.getAllByText('Parcourir')[0])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(useSettingsStore.getState().settings.ssh!.privateKeyPath).toBe('/Users/me/.ssh/id_ed25519')
    expect(useSettingsStore.getState().settings.ssh!.publicKeyPath).toBe('/Users/me/.ssh/id_ed25519.pub')
    expect(mutate).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(100))
    expect(mutate).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('picks a public key file directly', async () => {
    dialogOpen.mockResolvedValue('/Users/me/.ssh/id_ed25519.pub')
    const user = userEvent.setup()
    render(<SshSection />)
    await user.click(screen.getAllByText('Parcourir')[1])
    expect(useSettingsStore.getState().settings.ssh!.publicKeyPath).toBe('/Users/me/.ssh/id_ed25519.pub')
  })

  it('does nothing when the file picker is dismissed', async () => {
    dialogOpen.mockResolvedValue(null)
    const user = userEvent.setup()
    render(<SshSection />)
    await user.click(screen.getAllByText('Parcourir')[0])
    expect(useSettingsStore.getState().settings.ssh!.privateKeyPath).toBe(INITIAL_SETTINGS.settings.ssh!.privateKeyPath)
  })

  it('toggles useSystemAgent', async () => {
    const user = userEvent.setup()
    render(<SshSection />)
    await user.click(screen.getByRole('checkbox'))
    expect(useSettingsStore.getState().settings.ssh!.useSystemAgent).toBe(false)
  })
})

describe('SshSection — public key display', () => {
  it('shows a placeholder when no key is loaded', () => {
    render(<SshSection />)
    expect(screen.getByText('Aucune clé publique SSH chargée')).toBeInTheDocument()
  })

  it('shows an error state when the key fails to load', () => {
    useSshPublicKey.mockReturnValue({ data: undefined, error: new Error('not found'), mutate: vi.fn() })
    render(<SshSection />)
    expect(screen.getByText(/Impossible de charger la clé publique/)).toBeInTheDocument()
  })

  it('shows the key content and copies it, reverting the label after 2s', async () => {
    useSshPublicKey.mockReturnValue({ data: 'ssh-ed25519 AAAA... me@host', error: undefined, mutate: vi.fn() })
    vi.useFakeTimers()
    render(<SshSection />)
    expect(screen.getByText('ssh-ed25519 AAAA... me@host')).toBeInTheDocument()

    act(() => fireEvent.click(screen.getByText('Copier')))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ssh-ed25519 AAAA... me@host')
    expect(screen.getByText('Copié !')).toBeInTheDocument()

    await act(async () => vi.advanceTimersByTime(2000))
    expect(screen.getByText('Copier')).toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('SshSection — key generator', () => {
  it('is hidden by default and toggles open/closed', async () => {
    const user = userEvent.setup()
    render(<SshSection />)
    expect(screen.queryByText('Type de clé')).not.toBeInTheDocument()
    await user.click(screen.getByText('Ouvrir le générateur'))
    expect(screen.getByText('Type de clé')).toBeInTheDocument()
    await user.click(screen.getByText('Masquer'))
    expect(screen.queryByText('Type de clé')).not.toBeInTheDocument()
  })

  it('defaults to ed25519 with its default path, switching to rsa reveals the bit-size selector and default path', async () => {
    const user = userEvent.setup()
    render(<SshSection />)
    await user.click(screen.getByText('Ouvrir le générateur'))
    // The generator's own destination-path input starts with the same default value as the
    // top-level private-key-path input, so scope the query to the "Chemin de destination" field.
    const destPathInput = () => screen.getByText('Chemin de destination').nextElementSibling as HTMLInputElement
    expect(destPathInput()).toHaveValue('~/.ssh/id_ed25519')
    expect(screen.queryByText('Taille en bits')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByDisplayValue('ED25519 (Recommandé)'), 'rsa')
    expect(screen.getByText('Taille en bits')).toBeInTheDocument()
    expect(destPathInput()).toHaveValue('~/.ssh/id_rsa')
  })

  it('generates an ed25519 key with the entered comment, updates the store, and shows the result', async () => {
    mockedGenerateKey.mockResolvedValue('ssh-ed25519 AAAAgenerated me@host')
    const mutate = vi.fn()
    useSshPublicKey.mockReturnValue({ data: undefined, error: undefined, mutate })
    const user = userEvent.setup()
    render(<SshSection />)
    await user.click(screen.getByText('Ouvrir le générateur'))
    await user.type(screen.getByPlaceholderText('votre.email@domain.com'), 'me@host')
    await user.click(screen.getByText('Générer le couple de clés'))

    expect(mockedGenerateKey).toHaveBeenCalledWith('ed25519', null, 'me@host', '~/.ssh/id_ed25519', undefined)
    expect(await screen.findByText('Clé générée avec succès !')).toBeInTheDocument()
    expect(screen.getByDisplayValue('ssh-ed25519 AAAAgenerated me@host')).toBeInTheDocument()
    expect(useSettingsStore.getState().settings.ssh!.privateKeyPath).toBe('~/.ssh/id_ed25519')
    expect(useSettingsStore.getState().settings.ssh!.publicKeyPath).toBe('~/.ssh/id_ed25519.pub')
    expect(mutate).toHaveBeenCalledWith('ssh-ed25519 AAAAgenerated me@host', false)
  })

  it('uses the selected bit size and passphrase for an rsa key, defaulting the comment', async () => {
    mockedGenerateKey.mockResolvedValue('ssh-rsa AAAA...')
    const user = userEvent.setup()
    render(<SshSection />)
    await user.click(screen.getByText('Ouvrir le générateur'))
    await user.selectOptions(screen.getByDisplayValue('ED25519 (Recommandé)'), 'rsa')
    await user.selectOptions(screen.getByDisplayValue('3072 bits (Sécurisé)'), '4096')
    await user.type(screen.getByPlaceholderText('Laisser vide pour pas de mot de passe'), 'secret')
    await user.click(screen.getByText('Générer le couple de clés'))

    expect(mockedGenerateKey).toHaveBeenCalledWith('rsa', 4096, 'git-manager-key', '~/.ssh/id_rsa', 'secret')
  })

  it('shows an inline error when generation fails', async () => {
    mockedGenerateKey.mockRejectedValue(new Error('permission denied'))
    const user = userEvent.setup()
    render(<SshSection />)
    await user.click(screen.getByText('Ouvrir le générateur'))
    await user.click(screen.getByText('Générer le couple de clés'))
    expect(await screen.findByText(/permission denied/)).toBeInTheDocument()
  })
})
