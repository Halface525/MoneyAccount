// 检查更新：App 打开时自动查一次（6 小时内不重复），也可以手动点。
//
// 以前只读 raw.githubusercontent.com 一个地址，手机网络经常连不上，只能一遍遍
// 手动点。现在同时问几个镜像（都带 CORS 头），谁先回来用谁，并取这一批里
// 版本最高的，避免某个 CDN 还缓存着旧版本。结果缓存在本机 6 小时。
//
// 只读公开的 package.json / Release 信息，不上传任何记账数据。

const REPO = 'nimingzhe-ding/MoneyAccount'

export const RELEASES_URL = `https://github.com/${REPO}/releases`

const CACHE_KEY = 'suishouji.update.cache'
const MUTE_KEY = 'suishouji.update.mute'

/** 一次成功检查的结果，会缓存在本机 */
export interface UpdateInfo {
  latest: string
  downloadUrl: string
  releaseUrl: string
  checkedAt: number
  source: string
}

export type CheckResult =
  | { ok: true; info: UpdateInfo; hasUpdate: boolean }
  | { ok: false; reason: 'network' | 'format' }

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

/** 安装包按 Release 里的命名约定拼出来：suishouji-1.5.0.apk */
export function apkUrl(version: string): string {
  return `https://github.com/${REPO}/releases/download/v${version}/suishouji-${version}.apk`
}

const isVersion = (v: string) => /^\d+\.\d+\.\d+$/.test(v)

/* ------------------------------------------------------------------ */
/* 本地缓存                                                            */
/* ------------------------------------------------------------------ */

function store(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function readCachedUpdate(): UpdateInfo | null {
  const raw = store()?.getItem(CACHE_KEY)
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Partial<UpdateInfo>
    if (typeof o.latest !== 'string' || !isVersion(o.latest)) return null
    return {
      latest: o.latest,
      downloadUrl:
        typeof o.downloadUrl === 'string' && o.downloadUrl ? o.downloadUrl : apkUrl(o.latest),
      releaseUrl: RELEASES_URL,
      checkedAt: Number(o.checkedAt) || 0,
      source: typeof o.source === 'string' ? o.source : '',
    }
  } catch {
    return null
  }
}

function cacheUpdate(info: UpdateInfo) {
  try {
    store()?.setItem(CACHE_KEY, JSON.stringify(info))
  } catch {
    // 存不下就算了，下次重新查
  }
}

/** 用户点了「×」不再提醒的那个版本 */
export function readMutedVersion(): string {
  return store()?.getItem(MUTE_KEY) ?? ''
}

export function saveMutedVersion(version: string) {
  try {
    store()?.setItem(MUTE_KEY, version)
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/* 网络                                                                */
/* ------------------------------------------------------------------ */

interface Hit {
  version: string
  downloadUrl?: string
  source: string
}

interface Source {
  name: string
  url: string
  /** Release API 会多给一个真实安装包地址 */
  release?: boolean
}

const API_URL = `https://gh-proxy.com/https://api.github.com/repos/${REPO}/releases/latest`

/** 全部带 Access-Control-Allow-Origin，WebView 里才读得到 */
const SOURCES: Source[] = [
  {
    name: 'gh-proxy',
    url: `https://gh-proxy.com/https://raw.githubusercontent.com/${REPO}/main/package.json`,
  },
  {
    name: 'raw.githubusercontent',
    url: `https://raw.githubusercontent.com/${REPO}/main/package.json`,
  },
  {
    name: 'jsDelivr',
    url: `https://cdn.jsdelivr.net/gh/${REPO}@main/package.json`,
  },
  {
    name: 'GitHub API',
    url: API_URL,
    release: true,
  },
]

const FETCH_TIMEOUT = 6000
/** 第一个响应回来后再等一小会儿，让更快的镜像也有机会报出更高版本 */
const SETTLE_WINDOW = 1500

function parsePkg(data: unknown): Hit | null {
  if (typeof data !== 'object' || data === null) return null
  const raw = (data as { version?: unknown }).version
  const version = typeof raw === 'string' ? raw.trim() : ''
  return isVersion(version) ? { version, source: '' } : null
}

interface ReleaseAsset {
  name?: unknown
  browser_download_url?: unknown
}

function parseRelease(data: unknown): Hit | null {
  if (typeof data !== 'object' || data === null) return null
  const o = data as { tag_name?: unknown; assets?: unknown }
  const tag = typeof o.tag_name === 'string' ? o.tag_name : ''
  const version = (tag.match(/\d+\.\d+\.\d+/) ?? [''])[0]
  if (!isVersion(version)) return null
  const assets = Array.isArray(o.assets) ? (o.assets as ReleaseAsset[]) : []
  const apk = assets.find(
    (a) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.apk'),
  )
  return {
    version,
    source: '',
    downloadUrl:
      typeof apk?.browser_download_url === 'string' ? apk.browser_download_url : undefined,
  }
}

async function fetchSource(src: Source): Promise<Hit> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const res = await fetch(src.url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`http ${res.status}`)
    const data: unknown = await res.json()
    const hit = src.release ? parseRelease(data) : parsePkg(data)
    if (!hit) throw new Error('bad payload')
    return { ...hit, source: src.name }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 同时问所有镜像：
 * - 收到第一个有效结果后开始计时，1.5 秒后收口；全部返回则立刻收口
 * - 一个都不通才算失败
 */
function raceSources(): Promise<Hit[]> {
  return new Promise((resolve) => {
    const hits: Hit[] = []
    let pending = SOURCES.length
    let done = false
    let timer: number | undefined

    const finish = () => {
      if (done) return
      done = true
      if (timer !== undefined) window.clearTimeout(timer)
      resolve(hits)
    }

    const settle = (hit: Hit | null) => {
      pending--
      if (hit) {
        hits.push(hit)
        if (hits.length === 1) timer = window.setTimeout(finish, SETTLE_WINDOW)
      }
      if (pending === 0) finish()
    }

    SOURCES.forEach((src) => {
      fetchSource(src).then(settle, () => settle(null))
    })
  })
}

export async function checkUpdate(current: string): Promise<CheckResult> {
  const hits = await raceSources()
  if (hits.length === 0) return { ok: false, reason: 'network' }

  // 同一批里取版本最高的，避免某个 CDN 还缓存着旧版本
  hits.sort((a, b) => compareVersion(b.version, a.version))
  const best = hits[0]
  const withDownload = hits.find((h) => h.version === best.version && h.downloadUrl)

  const info: UpdateInfo = {
    latest: best.version,
    downloadUrl: withDownload?.downloadUrl ?? apkUrl(best.version),
    releaseUrl: RELEASES_URL,
    checkedAt: Date.now(),
    source: best.source,
  }

  cacheUpdate(info)
  return { ok: true, info, hasUpdate: compareVersion(info.latest, current) > 0 }
}
