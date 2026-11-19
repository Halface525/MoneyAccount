import { useEffect } from 'react'
import { useHashRoute, parseRoute } from './lib/router'
import { initNative, onQuickAddRequest, registerBackButton, syncStatusBar } from './lib/native'
import { useApp } from './lib/store'
import TabBar from './components/TabBar'
import HomePage from './pages/HomePage'
import TransactionsPage from './pages/TransactionsPage'
import AddPage from './pages/AddPage'
import StatsPage from './pages/StatsPage'
import MinePage from './pages/MinePage'
import BudgetPage from './pages/BudgetPage'
import AccountsPage from './pages/AccountsPage'
import RecurringPage from './pages/RecurringPage'
import SettingsPage from './pages/SettingsPage'
import CategoriesPage from './pages/CategoriesPage'
import ChatPage from './pages/ChatPage'
import CalendarPage from './pages/CalendarPage'
import FileAccessGate from './components/FileAccessGate'

const TABS = ['home', 'list', 'stats', 'mine']

export default function App() {
  const { route, navigate, back } = useHashRoute()
  const { segs, params } = parseRoute(route)
  const page = segs[0] || 'home'
  const { theme } = useApp()

  useEffect(() => {
    window.scrollTo(0, 0)
    document.body.style.overflow = page === 'add' ? 'hidden' : ''
  }, [route, page])

  // 原生：初始化状态栏，并在主题切换时同步状态栏颜色
  useEffect(() => {
    initNative()
  }, [])

  useEffect(() => {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    syncStatusBar(theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme)
  }, [theme])

  // 原生：安卓返回键 → 逐级后退，到首页再次按下才退出
  useEffect(() => {
    return registerBackButton(() => {
      if (page === 'add') {
        back()
        return true
      }
      if (TABS.includes(page)) return false
      back()
      return true
    })
  }, [page, back])

  // 原生：桌面小组件的「+」/快捷分类 → 直接进记账页并预选分类或收支类型
  useEffect(
    () =>
      onQuickAddRequest(({ cat, type }) => {
        const query = new URLSearchParams()
        if (cat) query.set('cat', cat)
        if (type) query.set('type', type)
        const qs = query.toString()
        navigate(`/add${qs ? `?${qs}` : ''}`)
      }),
    [navigate],
  )

  const showTab = TABS.includes(page)

  let content: React.ReactNode = null
  switch (page) {
    case 'home':
      content = <HomePage navigate={navigate} />
      break
    case 'list':
      content = <TransactionsPage navigate={navigate} />
      break
    case 'stats':
      content = <StatsPage navigate={navigate} />
      break
    case 'mine':
      content = <MinePage navigate={navigate} />
      break
    case 'budget':
      content = <BudgetPage back={back} />
      break
    case 'accounts':
      content = <AccountsPage back={back} />
      break
    case 'recurring':
      content = <RecurringPage back={back} />
      break
    case 'settings':
      content = <SettingsPage back={back} navigate={navigate} />
      break
    case 'categories':
      content = <CategoriesPage back={back} />
      break
    case 'chat':
      content = <ChatPage back={back} navigate={navigate} />
      break
    case 'calendar':
      content = <CalendarPage back={back} />
      break
    case 'add':
      content = null
      break
    default:
      content = <HomePage navigate={navigate} />
  }

  return (
    <div className="app-frame">
      <FileAccessGate />
      {content}
      {showTab && <TabBar page={page} navigate={navigate} />}
      {page === 'add' && (
        <AddPage
          back={back}
          editId={params.get('id') ?? undefined}
          presetType={
            (params.get('type') as 'expense' | 'income' | 'transfer' | undefined) ??
            undefined
          }
          presetCat={params.get('cat') ?? undefined}
          navigate={navigate}
        />
      )}
    </div>
  )
}
