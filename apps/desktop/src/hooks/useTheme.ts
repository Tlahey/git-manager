import { useEffect, useRef } from 'react'
import { resolveSystemTheme } from '../lib/themes'
import { apiGetUserThemes } from '../api/theme.api'
import { warnOnInvalidUserTheme } from '../lib/userThemeValidation'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useEffectiveRepoSettings } from './useEffectiveRepoSettings'
import type { UserTheme } from '@git-manager/git-types'

const STYLE_TAG_PREFIX = 'user-theme-'

function injectUserThemeStyle(theme: UserTheme) {
  const id = `${STYLE_TAG_PREFIX}${theme.id}`
  if (document.getElementById(id)) return
  warnOnInvalidUserTheme(theme)
  const style = document.createElement('style')
  style.id = id
  style.textContent = theme.css
  document.head.appendChild(style)
}

function removeAllUserThemeStyles() {
  document.head.querySelectorAll(`[id^="${STYLE_TAG_PREFIX}"]`).forEach((el) => el.remove())
}

/**
 * Applies the active theme to <html data-theme="...">.
 * Also loads user-defined themes from ~/.git-manager/themes/ on mount
 * and injects them as <style> tags so that data-theme selectors work.
 *
 * The effective theme is repo-aware: if a repo is in play (the explicit `repoPathOverride`, else
 * the active repo tab), its per-repo theme override wins over the global theme; with no repo, or a
 * repo that doesn't override the theme, the global theme applies. Switching repo tabs re-applies
 * because the apply effect keys on the resolved theme.
 *
 * Call this hook once at the root of the application. Separate WebviewWindows (merge/rebase
 * editors) pass their own `repoPathOverride` so they honor that repo's theme.
 */
export function useTheme(repoPathOverride?: string) {
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const repoPath = repoPathOverride ?? activeRepo
  const { theme } = useEffectiveRepoSettings(repoPath)
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
    apiGetUserThemes()
      .then((themes) => {
        removeAllUserThemeStyles()
        themes.forEach(injectUserThemeStyle)
      })
      .catch(() => {
        // No user themes dir or Tauri unavailable (e.g. browser dev mode) — ignore
      })
  }, [])
}
