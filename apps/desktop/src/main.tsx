import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ConflictMergeWindow } from './components/merge-editor/ConflictMergeWindow'
import { initI18n } from '@git-manager/i18n'
import '@git-manager/ui/globals.css'
import './index.css'

// Initialize i18n before rendering
initI18n('fr').then(() => {
  const params = new URLSearchParams(window.location.search)
  const isMergeWindow = params.get('window') === 'merge'
  const repoPath = params.get('repoPath')
  const filePath = params.get('filePath')

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {isMergeWindow && repoPath && filePath ? (
        <ConflictMergeWindow repoPath={repoPath} filePath={filePath} />
      ) : (
        <App />
      )}
    </React.StrictMode>
  )
})
