import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settings.store'
import { registerAndApplyDynamicTheme } from '@git-manager/editor'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

// Configure @monaco-editor/react loader to use local monaco instance
loader.config({ monaco })

export function useMonacoTheme() {
  const theme = useSettingsStore((s) => s.settings.appearance.theme)

  useEffect(() => {
    // Wait a frame for CSS variables to be applied to the DOM
    const handle = requestAnimationFrame(() => {
      registerAndApplyDynamicTheme(monaco)
    })

    return () => cancelAnimationFrame(handle)
  }, [theme])
}
