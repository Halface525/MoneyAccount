// 检查更新：点一次才发一次 GET，不自动轮询。
// 只读取仓库里的 package.json 拿版本号 —— 不上传任何记账数据，
// App 本身仍然是纯本地的。

const PKG_URL = 'https://raw.githubusercontent.com/nimingzhe-ding/MoneyAccount/main/package.json'
export const RELEASES_URL = 'https://github.com/nimingzhe-ding/MoneyAccount/releases'

/** 比较两个 x.y.z 版本号：a 比 b 新返回正数，相同返回 0 */
export function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export type UpdateResult =
  | { ok: true; latest: string; hasUpdate: boolean }
  | { ok: false; reason: 'network' | 'format' }

export async function checkUpdate(current: string): Promise<UpdateResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    // 加随机参数绕过 raw.githubusercontent 的 CDN 缓存
    const res = await fetch(`${PKG_URL}?t=${Date.now()}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, reason: 'network' }
    const data: unknown = await res.json()
    const latest =
      typeof data === 'object' && data !== null && 'version' in data
        ? String((data as { version: unknown }).version)
        : ''
    if (!/^\d+\.\d+\.\d+$/.test(latest)) return { ok: false, reason: 'format' }
    return { ok: true, latest, hasUpdate: compareVersion(latest, current) > 0 }
  } catch {
    return { ok: false, reason: 'network' }
  } finally {
    clearTimeout(timer)
  }
}
