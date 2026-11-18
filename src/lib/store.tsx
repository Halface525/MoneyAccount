import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, setSetting } from '../db'
import { syncWidget } from './widget'
import { openExternal } from './native'
import {
  RELEASES_URL,
  checkUpdate,
  compareVersion,
  readCachedUpdate,
  readMutedVersion,
  saveMutedVersion,
  type UpdateInfo,
} from './update'
import type { Account, Budget, Category, Recurring, Transaction } from '../db/types'

type Theme = 'auto' | 'light' | 'dark'

/** 缓存有效期：6 小时内不重复联网，启动时先用缓存立即出提示 */
const UPDATE_TTL = 6 * 60 * 60 * 1000

/** 检查更新：首页横幅和设置页共用这一份状态 */
interface UpdateCtx {
  info: UpdateInfo | null
  hasUpdate: boolean
  /** 用户点了「×」的那个版本，不再提醒 */
  mutedVersion: string
  checking: boolean
  error: 'network' | 'format' | null
  /** manual=true 时把结果用 toast 说明白，自动检查则安静 */
  refresh: (manual?: boolean) => Promise<void>
  download: () => void
  mute: () => void
}

interface AppCtx {
  transactions: Transaction[]
  accounts: Account[]
  categories: Category[]
  budgets: Budget[]
  recurring: Recurring[]
  theme: Theme
  setTheme: (t: Theme) => void
  toast: (msg: string) => void
  catMap: Map<string, Category>
  accMap: Map<string, Account>
  accountBalances: Map<string, number>
  update: UpdateCtx
}

const Ctx = createContext<AppCtx | null>(null)

export function useApp(): AppCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}

function applyTheme(theme: Theme) {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme
  document.documentElement.dataset.theme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#12100E' : '#f4f1ec')
}

export function AppProvider({ children }: { children: ReactNode }) {
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [])
  const accounts = useLiveQuery(
    () => db.accounts.orderBy('order').toArray(),
    [],
    [],
  )
  const categories = useLiveQuery(
    () => db.categories.orderBy('order').toArray(),
    [],
    [],
  )
  const budgets = useLiveQuery(() => db.budgets.toArray(), [], [])
  const recurring = useLiveQuery(() => db.recurring.toArray(), [], [])

  const [theme, setThemeState] = useState<Theme>('auto')
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    getSetting<Theme>('theme', 'auto').then((t) => {
      setThemeState(t)
      applyTheme(t)
    })
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme(theme)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    applyTheme(t)
    setSetting('theme', t)
  }, [])

  // 账本或主题一变，就把最新的几个数字推给桌面小组件。
  // 防抖 350ms：连续记账时不必每一笔都跨桥一次。
  useEffect(() => {
    const id = window.setTimeout(() => {
      void syncWidget(transactions, budgets, theme)
    }, 350)
    return () => window.clearTimeout(id)
  }, [transactions, budgets, theme])

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 1900)
  }, [])

  /* ---------------- 检查更新 ----------------
   * 打开 App 时读一次本地缓存：有新版立刻出横幅；超过 6 小时才真正联网复查。
   * 不轮询、不起后台任务，检查失败就安静地等下次打开。 */
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(() => readCachedUpdate())
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateError, setUpdateError] = useState<'network' | 'format' | null>(null)
  const [mutedVersion, setMutedVersion] = useState(() => readMutedVersion())

  const infoRef = useRef<UpdateInfo | null>(updateInfo)
  infoRef.current = updateInfo
  const checkingRef = useRef(false)
  const retryRef = useRef(0)
  const refreshRef = useRef<(manual?: boolean) => Promise<void>>(async () => {})

  const refreshUpdate = useCallback(
    async (manual = false) => {
      if (checkingRef.current) return
      checkingRef.current = true
      setUpdateChecking(true)
      const res = await checkUpdate(__APP_VERSION__)
      checkingRef.current = false
      setUpdateChecking(false)

      if (!res.ok) {
        setUpdateError(res.reason)
        if (manual) {
          toast(res.reason === 'network' ? '网络不通，稍后自动再试' : '版本信息读不出来')
        }
        // 网络抖一下就重试两次，不用用户自己再点
        const n = retryRef.current
        if (n < 2) {
          retryRef.current = n + 1
          window.setTimeout(() => void refreshRef.current(false), n === 0 ? 20000 : 60000)
        }
        return
      }

      retryRef.current = 0
      setUpdateError(null)
      setUpdateInfo(res.info)
      if (manual) toast(res.hasUpdate ? `发现新版本 v${res.info.latest}` : '已经是最新版本')
    },
    [toast],
  )
  refreshRef.current = refreshUpdate

  useEffect(() => {
    const maybeCheck = () => {
      const cached = readCachedUpdate()
      if (cached) setUpdateInfo(cached)
      if (!cached || Date.now() - cached.checkedAt > UPDATE_TTL) {
        void refreshRef.current(false)
      }
    }
    maybeCheck()

    const onVisible = () => {
      if (document.visibilityState === 'visible') maybeCheck()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const muteUpdate = useCallback(() => {
    const latest = infoRef.current?.latest
    if (!latest) return
    saveMutedVersion(latest)
    setMutedVersion(latest)
  }, [])

  const downloadUpdate = useCallback(() => {
    const url = infoRef.current?.downloadUrl || RELEASES_URL
    void openExternal(url).catch(() => {})
  }, [])

  const hasUpdate =
    updateInfo !== null && compareVersion(updateInfo.latest, __APP_VERSION__) > 0

  const updateCtx: UpdateCtx = {
    info: updateInfo,
    hasUpdate,
    mutedVersion,
    checking: updateChecking,
    error: updateError,
    refresh: refreshUpdate,
    download: downloadUpdate,
    mute: muteUpdate,
  }

  const catMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )
  const accMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  )

  const accountBalances = useMemo(() => {
    const m = new Map<string, number>()
    accounts.forEach((a) => m.set(a.id, a.initialBalance))
    transactions.forEach((t) => {
      if (t.type === 'expense') {
        m.set(t.accountId, (m.get(t.accountId) ?? 0) - t.amount)
      } else if (t.type === 'income') {
        m.set(t.accountId, (m.get(t.accountId) ?? 0) + t.amount)
      } else {
        m.set(t.accountId, (m.get(t.accountId) ?? 0) - t.amount)
        if (t.toAccountId)
          m.set(t.toAccountId, (m.get(t.toAccountId) ?? 0) + t.amount)
      }
    })
    return m
  }, [accounts, transactions])

  const value: AppCtx = {
    transactions,
    accounts,
    categories,
    budgets,
    recurring,
    theme,
    setTheme,
    toast,
    catMap,
    accMap,
    accountBalances,
    update: updateCtx,
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </Ctx.Provider>
  )
}
