import { useEffect, useRef } from 'react'
import { useSettingsStore } from '../stores/settings.store'
import { resolveSystemTheme } from '../lib/themes'
import { getUserThemes } from '../lib/tauri'
import type { UserTheme } from '@git-manager/git-types'

const STYLE_TAG_PREFIX = 'user-theme-'

function injectUserThemeStyle(theme: UserTheme) {
  const id = `${STYLE_TAG_PREFIX}${theme.id}`
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = theme.css
  document.head.appendChild(style)
}

function removeAllUserThemeStyles() {
  document.head
    .querySelectorAll(`[id^="${STYLE_TAG_PREFIX}"]`)
    .forEach((el) => el.remove())
}

/**
 * Applies the active theme to <html data-theme="...">.
 * Also loads user-defined themes from ~/.git-manager/themes/ on mount
 * and injects them as <style> tags so that data-theme selectors work.
 *
 * Call this hook once at the root of the application.
 */
export function useTheme() {
  const theme = useSettingsStore((s) => s.settings.appearance.theme)
  const mediaQueryRef = useRef<MediaQueryList | null>(null)

  // ── Apply theme on change ───────────────────────────────────────────────────
  useEffect(() => {
    function apply(themeId: string) {
      const resolved = themeId === 'system' ? resolveSystemTheme() : themeId
      document.documentElement.dataset.theme = resolved
    }

    apply(theme)

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mediaQueryRef.current = mq
      const handler = () => apply('system')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } else {
      mediaQueryRef.current = null
    }
  }, [theme])

  // ── Load user themes once on mount ─────────────────────────────────────────
  useEffect(() => {
    getUserThemes()
      .then((themes) => {
        removeAllUserThemeStyles()
        themes.forEach(injectUserThemeStyle)
      })
      .catch(() => {
        // No user themes dir or Tauri unavailable (e.g. browser dev mode) — ignore
      })
  }, [])
}
