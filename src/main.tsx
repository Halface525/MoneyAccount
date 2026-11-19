import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'
import { AppProvider } from './lib/store'
import { runRecurringCatchUp } from './lib/recurring'
import { installAutoSave, restoreFromFile, flushSave } from './lib/datafile'

/**
 * 启动顺序。
 *
 * 以前是「先读文件、读完了才渲染」，冷启动要多等一次文件 IO。
 * 现在先让 React 把界面画出来，文件回填放到首帧之后再做。
 *
 * 顺序上有个坑必须守住：**自动落盘要在回填之后才挂**。
 * 首次打开时 IndexedDB 是空的，Dexie 会往里灌默认分类和账户，
 * 这个写入如果已经挂上钩子，就会立刻把一份空账本写成文件，
 * 把用户原来那份覆盖掉。回填期间不挂钩子，天然避开了这件事。
 */
async function boot() {
  // 1) 先把首屏画出来，界面来自 IndexedDB（正常使用时它就是最新的一份）
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </StrictMode>,
  )

  // 2) 退到后台 / 页面隐藏时立刻存一次，别等防抖
  const save = () => {
    void flushSave()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save()
  })
  window.addEventListener('pagehide', save)
  window.addEventListener('beforeunload', save)

  // 3) 等首帧真正画完，再做文件回填
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })

  try {
    await restoreFromFile()
  } catch (err) {
    console.warn('[boot] 读数据文件失败', err)
  }

  // 4) 回填完了才挂自动落盘，之后任何一处改数据都会写成文件
  installAutoSave()

  // 5) 周期账单补记（补记本身会触发自动保存）
  await runRecurringCatchUp().catch(() => {})
}

void boot()
