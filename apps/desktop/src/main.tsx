import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initI18n } from '@git-manager/i18n'
import '@git-manager/ui/globals.css'
import './index.css'

// Initialize i18n before rendering
initI18n('fr').then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
