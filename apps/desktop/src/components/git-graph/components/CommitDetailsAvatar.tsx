import { useState, useEffect } from 'react'
import { getAvatarUrl } from '../../../lib/avatar'
import { useSettingsStore } from '../../../stores/settings.store'
import { useGameStore, getLevelInfo } from '../../../stores/game.store'

const AVATAR_COLORS = [
  'from-purple-500 to-indigo-600',
  'from-blue-500 to-cyan-600',
  'from-green-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-red-500 to-rose-600',
  'from-pink-500 to-fuchsia-600'
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
    hash |= 0
  }
  return Math.abs(hash)
}

function getAuthorAvatarStyle(name: string): string {
  return AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length]
}

function getAuthorInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

interface CommitDetailsAvatarProps {
  name: string
  email: string
}

export function CommitDetailsAvatar({ name, email }: CommitDetailsAvatarProps) {
  const avatarUrl = getAvatarUrl(email, name)
  const [imgError, setImgError] = useState(false)
  const defaultEmail = useSettingsStore((s) => s.settings.git?.defaultAuthorEmail)
  const defaultName = useSettingsStore((s) => s.settings.git?.defaultAuthorName)
  const { points, achievements } = useGameStore()
  const isPlatinumUnlocked = achievements.find((a) => a.id === 'platinum_trophy')?.unlocked || false
  const { frameClass } = getLevelInfo(points, isPlatinumUnlocked)

  const isMe =
    (email && defaultEmail && email.toLowerCase().trim() === defaultEmail.toLowerCase().trim()) ||
    (name && defaultName && name.toLowerCase().trim() === defaultName.toLowerCase().trim())

  useEffect(() => {
    setImgError(false)
  }, [email, name])

  const avatarEl = (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-md overflow-hidden ${
        avatarUrl && !imgError ? '' : getAuthorAvatarStyle(name)
      }`}
    >
      {avatarUrl && !imgError ? (
        <img
          src={avatarUrl}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        getAuthorInitials(name)
      )}
    </div>
  )

  if (isMe && frameClass) {
    return (
      <div className={`p-[1px] shrink-0 rounded-full flex items-center justify-center ${frameClass}`}>
        {avatarEl}
      </div>
    )
  }

  return avatarEl
}
