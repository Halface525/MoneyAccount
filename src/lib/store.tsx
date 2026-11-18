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
import type { Account, Budget, Category, Recurring, Transaction } from '../db/types'

type Theme = 'auto' | 'light' | 'dark'

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
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </Ctx.Provider>
  )
}
