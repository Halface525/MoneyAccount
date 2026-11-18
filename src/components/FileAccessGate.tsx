import { useEffect, useState } from 'react'
import Sheet from './Sheet'
import {
  hasFileAccess,
  requestFileAccess,
  retryAfterPermission,
  isNativePlatform,
} from '../lib/datafile'

/**
 * 首次启动时检查「文件访问」权限。
 *
 * 为什么非要有这个权限：账本要作为文件长期存在手机的 Documents 目录里，
 * 安卓 11+ 的分区存储只允许 App 访问自己创建的文件，一旦清除应用数据
 * 就失去归属权，之前的账本读不回来。拿到「所有文件访问」才不受这个限制。
 */
export default function FileAccessGate() {
  const [need, setNeed] = useState(false)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    if (!isNativePlatform) return
    void hasFileAccess().then((ok) => setNeed(!ok))
    // 从系统设置页返回时再查一次
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void (async () => {
          if (await hasFileAccess()) {
            await retryAfterPermission()
            setNeed(false)
          }
        })()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  if (!need) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      <Sheet title="允许访问文件" onClose={() => setNeed(false)}>
        <div style={{ padding: '0 4px 14px', lineHeight: 1.75, fontSize: 14, color: 'var(--text-2)' }}>
          账本要存在手机的
          <b style={{ color: 'var(--text)' }}> Documents/随手记/ </b>
          目录里，这样卸载重装、清数据、换手机都不会丢。
          <br />
          <br />
          安卓 11 以后需要你手动允许一次「所有文件访问」，否则 App
          只能看到自己新建的文件，读不回之前存的账本。
        </div>
        <button
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={asking}
          onClick={async () => {
            setAsking(true)
            await requestFileAccess()
            setAsking(false)
            // 用户可能去了设置页又回来，重新查一次状态
            const ok = await hasFileAccess()
            if (ok) await retryAfterPermission()
            setNeed(!ok)
          }}
        >
          {asking ? '正在打开设置…' : '去设置里允许'}
        </button>
        <button
          className="btn btn-ghost"
          style={{ width: '100%', marginTop: 8 }}
          onClick={() => setNeed(false)}
        >
          以后再说
        </button>
        <div className="small muted" style={{ padding: '12px 4px 0', lineHeight: 1.6 }}>
          路径：设置 → 应用 → 随手记 → 权限 → 所有文件访问
        </div>
      </Sheet>
    </div>
  )
}
