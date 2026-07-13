import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ConflictMergeWindow } from './components/merge-editor/ConflictMergeWindow'
import { FixupCommitWindow } from './components/git-graph/fixup/FixupCommitWindow'
import { RebasingCommitWindow } from './components/rebase-editor/RebasingCommitWindow'
import { initI18n } from '@git-manager/i18n'
import { useSettingsStore } from './stores/settings.store'
import { useRepoUIStore } from './stores/repoUI.store'
import '@git-manager/ui/globals.css'
import '@git-manager/code-view/styles.css'
import './index.css'

// WebdriverIO's Tauri plugin auto-initializes on import and must load before tests run.
// import.meta.env.VITE_E2E is a build-time constant, so this branch (and the whole
// @wdio/tauri-plugin chunk) is dead-code-eliminated from every non-e2e build.
const e2eSetup =
  import.meta.env.VITE_E2E === 'true' ? import('@wdio/tauri-plugin') : Promise.resolve()

// e2e-only debug hook: lets step definitions read live Zustand state directly (e.g.
// `selectedCommitOid`) instead of inferring it from a DOM attribute, which can't tell "React
// state never changed" apart from "the DOM just hasn't reflected it yet". Same dead-code-elimination
// guarantee as the wdio plugin above — stripped from every non-e2e build.
if (import.meta.env.VITE_E2E === 'true') {
  ;(window as unknown as { __e2eRepoUIStore: typeof useRepoUIStore }).__e2eRepoUIStore =
    useRepoUIStore
}

// Fades out and removes the static splash markup painted instantly by index.html once the
// real app has committed its first frame. The setTimeout fallback guarantees removal even
// if `transitionend` never fires (e.g. reduced-motion, or no matching CSS transition).
function hideSplash() {
  const splash = document.getElementById('app-splash')
  if (!splash) return
  splash.classList.add('is-hidden')
  const remove = () => splash.remove()
  splash.addEventListener('transitionend', remove, { once: true })
  setTimeout(remove, 300)
}

// Initialize i18n before rendering, honoring the persisted language choice
// (the zustand store rehydrates synchronously from localStorage on import).
e2eSetup
  .then(() => initI18n(useSettingsStore.getState().settings.language))
  .then(() => {
    const params = new URLSearchParams(window.location.search)
    const windowKind = params.get('window')
    const repoPath = params.get('repoPath')
    const filePath = params.get('filePath')
    const oid = params.get('oid')
    const shortOid = params.get('shortOid')
    const subject = params.get('subject')
    const baseOid = params.get('baseOid')

    let content: React.ReactNode
    if (windowKind === 'merge' && repoPath && filePath) {
      content = <ConflictMergeWindow repoPath={repoPath} filePath={filePath} />
    } else if (windowKind === 'rebase' && repoPath && baseOid) {
      content = <RebasingCommitWindow repoPath={repoPath} baseOid={baseOid} />
    } else if (windowKind === 'fixup' && repoPath && oid) {
      content = (
        <FixupCommitWindow
          repoPath={repoPath}
          targetOid={oid}
          targetShortOid={shortOid ?? oid.slice(0, 7)}
          targetSubject={subject ?? ''}
        />
      )
    } else {
      content = <App />
    }

    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>{content}</React.StrictMode>
    )
    requestAnimationFrame(hideSplash)
  })
