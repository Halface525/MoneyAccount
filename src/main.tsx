import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './styles/global.css'
import App from './App'
import { AppProvider } from './lib/store'
import { runRecurringCatchUp } from './lib/recurring'
import { isNative } from './lib/native'

runRecurringCatchUp().catch(() => {})

// 只有网页 / PWA 才注册 Service Worker。
// 原生 App 里 dist 是本地打包的资源，SW 反而会缓存住旧版本，导致升级 APK 后
// 界面还是老的，所以原生端直接跳过（原生端本来也不依赖网络）。
if (!isNative && 'serviceWorker' in navigator) {
  registerSW({ immediate: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)
