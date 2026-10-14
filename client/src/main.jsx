import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './design-system.css'
import { AuthProvider } from './lib/auth-context.jsx'
import { installStaleBuildRecovery } from './lib/stale-build.js'
import { applyDisplay, loadDisplay } from './lib/display-preferences.js'

installStaleBuildRecovery()
applyDisplay(loadDisplay())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider><App /></AuthProvider>
  </React.StrictMode>,
)
