import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommitDetailsAvatar } from './CommitDetailsAvatar'
import { useSettingsStore } from '../../../stores/settings.store'
import { useGameStore } from '../../../stores/game.store'

const INITIAL_SETTINGS = useSettingsStore.getState()
const INITIAL_GAME = useGameStore.getState()

beforeEach(() => {
  useSettingsStore.setState(INITIAL_SETTINGS, true)
  useGameStore.setState({ ...INITIAL_GAME, points: 0, achievements: [] })
})

describe('CommitDetailsAvatar — image vs initials', () => {
  it('shows a gravatar image when an email is given', () => {
    render(<CommitDetailsAvatar name="Ada Lovelace" email="ada@example.com" />)
    const img = screen.getByRole('img', { name: 'Ada Lovelace' }) as HTMLImageElement
    expect(img.src).toContain('gravatar.com/avatar/')
  })

  it('falls back to initials when there is no email', () => {
    render(<CommitDetailsAvatar name="Ada Lovelace" email="" />)
    expect(screen.getByText('AL')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('falls back to initials once the image fails to load', () => {
    render(<CommitDetailsAvatar name="Ada Lovelace" email="ada@example.com" />)
    const img = screen.getByRole('img', { name: 'Ada Lovelace' })
    fireEvent.error(img)
    expect(screen.getByText('AL')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('falls back to initials entirely when avatars are disabled', () => {
    useSettingsStore.setState({
      settings: { ...INITIAL_SETTINGS.settings, appearance: { ...INITIAL_SETTINGS.settings.appearance, showAvatars: false } },
    })
    render(<CommitDetailsAvatar name="Ada Lovelace" email="ada@example.com" />)
    expect(screen.getByText('AL')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('uses the first two letters of a single-word name for initials', () => {
    render(<CommitDetailsAvatar name="madhatter" email="" />)
    expect(screen.getByText('MA')).toBeInTheDocument()
  })
})

describe('CommitDetailsAvatar — "isMe" avatar frame', () => {
  it('wraps the avatar in the level frame class when the email matches the default author and the level has a frame', () => {
    useSettingsStore.setState({
      settings: { ...INITIAL_SETTINGS.settings, git: { ...INITIAL_SETTINGS.settings.git, defaultAuthorEmail: 'me@example.com' } },
    })
    useGameStore.setState({ points: 60 }) // level 2 => avatar-frame-bronze
    const { container } = render(<CommitDetailsAvatar name="Me" email="me@example.com" />)
    expect(container.querySelector('.avatar-frame-bronze')).toBeInTheDocument()
  })

  it('matches by default author name too, without an email match', () => {
    useSettingsStore.setState({
      settings: { ...INITIAL_SETTINGS.settings, git: { ...INITIAL_SETTINGS.settings.git, defaultAuthorName: 'Antoine' } },
    })
    useGameStore.setState({ points: 130 }) // level 3 => avatar-frame-silver
    const { container } = render(<CommitDetailsAvatar name="Antoine" email="someone-else@example.com" />)
    expect(container.querySelector('.avatar-frame-silver')).toBeInTheDocument()
  })

  it('does not add a frame wrapper for level 1 (no frame class) even when it is me', () => {
    useSettingsStore.setState({
      settings: { ...INITIAL_SETTINGS.settings, git: { ...INITIAL_SETTINGS.settings.git, defaultAuthorEmail: 'me@example.com' } },
    })
    useGameStore.setState({ points: 0 }) // level 1 => frameClass ''
    const { container } = render(<CommitDetailsAvatar name="Me" email="me@example.com" />)
    expect(container.querySelector('[class*="avatar-frame"]')).not.toBeInTheDocument()
  })

  it('does not add a frame wrapper for another author, regardless of level', () => {
    useSettingsStore.setState({
      settings: { ...INITIAL_SETTINGS.settings, git: { ...INITIAL_SETTINGS.settings.git, defaultAuthorEmail: 'me@example.com' } },
    })
    useGameStore.setState({ points: 250 }) // level 4 => avatar-frame-gold
    const { container } = render(<CommitDetailsAvatar name="Someone Else" email="other@example.com" />)
    expect(container.querySelector('[class*="avatar-frame"]')).not.toBeInTheDocument()
  })

  it('uses the platinum frame once the platinum trophy is unlocked, regardless of points', () => {
    useSettingsStore.setState({
      settings: { ...INITIAL_SETTINGS.settings, git: { ...INITIAL_SETTINGS.settings.git, defaultAuthorEmail: 'me@example.com' } },
    })
    useGameStore.setState({
      points: 10,
      achievements: [{ id: 'platinum_trophy', unlocked: true } as never],
    })
    const { container } = render(<CommitDetailsAvatar name="Me" email="me@example.com" />)
    expect(container.querySelector('.avatar-frame-platinum')).toBeInTheDocument()
  })
})
