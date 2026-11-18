import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'
import { AppProvider } from './lib/store'
import { runRecurringCatchUp } from './lib/recurring'

runRecurringCatchUp().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)
