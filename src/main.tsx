import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'
import { AppProvider } from './lib/store'
import { runRecurringCatchUp } from './lib/recurring'
import { installAutoSave, restoreFromFile, flushSave } from './lib/datafile'

async function boot() {
  // 1) 先把手机里的数据文件读回来。文件是真相，IndexedDB 只是缓存。
  try {
    await restoreFromFile()
  } catch (err) {
    console.warn('[boot] 读数据文件失败', err)
  }

  // 2) 挂上自动落盘，之后任何一处改数据都会写成文件
  installAutoSave()

  // 3) 退到后台 / 页面隐藏时立刻存一次，别等防抖
  const save = () => { void flushSave() }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save()
  })
  window.addEventListener('pagehide', save)
  window.addEventListener('beforeunload', save)

  // 4) 周期账单补记（补记本身会触发自动保存）
  await runRecurringCatchUp().catch(() => {})

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </StrictMode>,
  )
}

void boot()
