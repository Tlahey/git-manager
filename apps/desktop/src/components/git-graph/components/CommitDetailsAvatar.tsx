import { useState, useEffect } from 'react'
import { getAvatarUrl } from '../../../lib/avatar'
import { getAuthorAvatarStyle, getAuthorInitials } from '../../../lib/authorAvatar'
import { useSettingsStore } from '../../../stores/settings.store'
import { useGameStore, getLevelInfo } from '../../../stores/game.store'

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
      className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white shadow-md ${
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
      <div
        className={`flex shrink-0 items-center justify-center rounded-full p-[1px] ${frameClass}`}
      >
        {avatarEl}
      </div>
    )
  }

  return avatarEl
}
