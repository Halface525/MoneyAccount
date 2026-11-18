import { useEffect } from 'react'
import { useHashRoute, parseRoute } from './lib/router'
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

const TABS = ['home', 'list', 'stats', 'mine']

export default function App() {
  const { route, navigate, back } = useHashRoute()
  const { segs, params } = parseRoute(route)
  const page = segs[0] || 'home'

  useEffect(() => {
    window.scrollTo(0, 0)
    document.body.style.overflow = page === 'add' ? 'hidden' : ''
  }, [route, page])

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
    case 'add':
      content = null
      break
    default:
      content = <HomePage navigate={navigate} />
  }

  return (
    <div className="app-frame">
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
