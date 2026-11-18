import {
  IconChart,
  IconHome,
  IconList,
  IconPlus,
  IconWallet,
} from './Icons'

export default function TabBar({
  page,
  navigate,
}: {
  page: string
  navigate: (to: string) => void
}) {
  const items = [
    { key: 'home', label: '首页', icon: <IconHome size={21} /> },
    { key: 'list', label: '明细', icon: <IconList size={21} /> },
    { key: '__add', label: '', icon: null },
    { key: 'stats', label: '统计', icon: <IconChart size={21} /> },
    { key: 'mine', label: '我的', icon: <IconWallet size={21} /> },
  ]

  return (
    <nav className="tabbar">
      {items.map((it) =>
        it.key === '__add' ? (
          <button
            key="add"
            className="tab-add"
            onClick={() => navigate('/add')}
            aria-label="记一笔"
          >
            <span className="fab">
              <IconPlus size={26} />
            </span>
          </button>
        ) : (
          <button
            key={it.key}
            className={'tab' + (page === it.key ? ' active' : '')}
            onClick={() => navigate('/' + it.key)}
          >
            <span className="em">{it.icon}</span>
            {it.label}
          </button>
        ),
      )}
    </nav>
  )
}
