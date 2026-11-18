import { useState } from 'react'
import { db } from '../db'
import { useApp } from '../lib/store'
import { IconChevronLeft, IconPlus } from '../components/Icons'
import CategoryEditor from '../components/CategoryEditor'
import { AppIcon } from '../lib/appIcons'
import type { Category } from '../db/types'

export default function CategoriesPage({ back }: { back: () => void }) {
  const { categories, toast } = useApp()
  const [tab, setTab] = useState<'expense' | 'income'>('expense')
  const [editing, setEditing] = useState<Category | 'new' | null>(null)

  const list = categories.filter((c) => c.type === tab)

  const move = async (c: Category, dir: -1 | 1) => {
    const idx = list.findIndex((x) => x.id === c.id)
    const target = list[idx + dir]
    if (!target) return
    await db.transaction('rw', db.categories, async () => {
      await db.categories.update(c.id, { order: target.order })
      await db.categories.update(target.id, { order: c.order })
    })
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="row" style={{ gap: 4 }}>
          <button className="back-btn" onClick={back}>
            <IconChevronLeft size={18} />
          </button>
          <h1>分类</h1>
        </div>
        <button className="icon-btn" onClick={() => setEditing('new')} aria-label="新建分类">
          <IconPlus size={19} />
        </button>
      </header>

      <div className="segmented" style={{ marginBottom: 12 }}>
        <button className={tab === 'expense' ? 'active' : ''} onClick={() => setTab('expense')}>
          支出分类
        </button>
        <button className={tab === 'income' ? 'active' : ''} onClick={() => setTab('income')}>
          收入分类
        </button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {list.map((c, i) => (
          <div
            key={c.id}
            className="list-row"
            style={{ borderTop: i === 0 ? 'none' : undefined, cursor: 'pointer' }}
            onClick={() => setEditing(c)}
          >
            <span
              className="cat-icon"
              style={{ background: c.color + '1f' }}
            >
              <AppIcon name={c.icon} size={18} color={c.color} />
            </span>
            <span className="lbl">{c.name}</span>
            <div className="row" style={{ gap: 2 }}>
              <button
                onClick={(e) => { e.stopPropagation(); move(c, -1) }}
                style={{ color: 'var(--text-3)', padding: 6 }}
                aria-label="上移"
              >
                ↑
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); move(c, 1) }}
                style={{ color: 'var(--text-3)', padding: 6 }}
                aria-label="下移"
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <CategoryEditor
          cat={editing === 'new' ? null : editing}
          type={tab}
          onClose={() => setEditing(null)}
          onDone={(msg) => { toast(msg); setEditing(null) }}
        />
      )}
    </div>
  )
}
