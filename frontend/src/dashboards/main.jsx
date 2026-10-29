import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import './styles/icons.css'
import './styles/polish.css'
import { installZeroKpiTone } from './lib/zeroKpiTone.js'
import App from './App.jsx'
import { I18nProvider } from '../i18n/index.jsx'

installZeroKpiTone()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider remount={false}>
      <App />
    </I18nProvider>
  </StrictMode>,
)
