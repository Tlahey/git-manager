import { useEffect, useRef } from 'react'
import { useSettingsStore } from '../stores/settings.store'
import { apiSetAppIcon } from '../api/appIcon.api'

import type { AppIconId } from '@git-manager/git-types'

/**
 * Pushes a *change* of `settings.appearance.appIcon` to the host, and nothing else.
 *
 * It deliberately does not apply on mount. Rust already applied the persisted icon in `setup`,
 * before the window existed — see `services/app_icon.rs` — so a mount-time apply would only
 * re-set the icon the app is already wearing, at the one moment it is most visible: React mounts
 * as the splash fades, which is exactly where the swap used to be seen. This hook exists for what
 * Rust cannot know about: the user picking another icon, or a second window's store catching up
 * with one that did.
 */
export function useAppIcon(): void {
  const appIcon = useSettingsStore((s) => s.settings.appearance.appIcon ?? 'default')
  const lastAppliedIcon = useRef<AppIconId | null>(null)

  useEffect(() => {
    // The first run only records what the host is already showing.
    if (lastAppliedIcon.current === null) {
      lastAppliedIcon.current = appIcon
      return
    }
    if (lastAppliedIcon.current === appIcon) return
    lastAppliedIcon.current = appIcon

    apiSetAppIcon(appIcon).catch((err) => {
      // Ignore failures off-macOS or in headless/browser dev environments where Tauri host is absent
      console.warn('Failed to apply application icon:', err)
    })
  }, [appIcon])
}
