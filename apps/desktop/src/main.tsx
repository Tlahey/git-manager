import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ConflictMergeWindow } from './components/merge-editor/ConflictMergeWindow'
import { FixupCommitWindow } from './components/git-graph/fixup/FixupCommitWindow'
import { RebasingCommitWindow } from './components/rebase-editor/RebasingCommitWindow'
import { initI18n } from '@git-manager/i18n'
import '@git-manager/ui/globals.css'
import './index.css'

// Initialize i18n before rendering
initI18n('fr').then(() => {
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
})
