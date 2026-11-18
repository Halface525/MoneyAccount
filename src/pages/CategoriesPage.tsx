import { useState } from 'react'
import { db } from '../db'
import { useApp } from '../lib/store'
import { uid } from '../lib/format'
import Sheet from '../components/Sheet'
import { IconChevronLeft, IconPlus, IconTrash } from '../components/Icons'
import type { Category } from '../db/types'

const ICONS = [
  '🍜','🍚','☕️','🍰','🥤','🍺','🛒','🛍️','👕','👟','🧴','💄','💊','🏥','🚇','🚌','🚕','⛽️','🚲','✈️',
  '🏠','💡','💧','📱','🌐','🎮','🎬','🎵','📚','✏️','🏀','🏃','🐱','🐶','🎁','🧧','💰','📈','💼','🧾',
  '📦','🔧','🪙','💳','🏦','🎓','👶','💍','🧳','🍎',
]

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
              {c.icon}
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

function CategoryEditor({
  cat,
  type,
  onClose,
  onDone,
}: {
  cat: Category | null
  type: 'expense' | 'income'
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const { categories, toast } = useApp()
  const [name, setName] = useState(cat?.name ?? '')
  const [icon, setIcon] = useState(cat?.icon ?? '📦')
  const [color, setColor] = useState(cat?.color ?? '#E8A33D')
  const [confirmDel, setConfirmDel] = useState(false)

  const COLORS = ['#FF8A5B','#5B9BFF','#FF6FA5','#8B7CF6','#4FC3A1','#F2B84B','#56C0E0','#F5748B','#6C8CF5','#E8756B','#7FC24B','#9A938C']

  const save = async () => {
    if (!name.trim()) return toast('请输入名称')
    const sameType = categories.filter((c) => c.type === type)
    const payload: Category = {
      id: cat?.id ?? uid('c_'),
      name: name.trim(),
      icon,
      type,
      color,
      order: cat?.order ?? (sameType.length ? Math.max(...sameType.map((c) => c.order)) + 1 : 1),
      archived: cat?.archived,
    }
    await db.categories.put(payload)
    onDone(cat ? '已更新分类' : '已添加分类')
  }

  return (
    <Sheet
      title={cat ? '编辑分类' : '新建分类'}
      onClose={onClose}
      right={
        cat ? (
          <button className="icon-btn" onClick={() => setConfirmDel(true)}>
            <IconTrash size={15} />
          </button>
        ) : undefined
      }
    >
      <div className="field">
        <span className="lbl">名称</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：早餐" maxLength={8} />
      </div>

      <div className="section-head" style={{ padding: '6px 2px 6px' }}>
        <h2>颜色</h2>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              background: c,
              border: color === c ? '2.5px solid var(--text)' : '2.5px solid transparent',
              transform: color === c ? 'scale(1.06)' : 'none',
            }}
            aria-label={c}
          />
        ))}
      </div>

      <div className="section-head" style={{ padding: '14px 2px 6px' }}>
        <h2>图标</h2>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {ICONS.map((ic) => (
          <button
            key={ic}
            onClick={() => setIcon(ic)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              fontSize: 18,
              background: icon === ic ? color + '2a' : 'var(--surface-3)',
              border: icon === ic ? `1.5px solid ${color}` : '1.5px solid transparent',
            }}
          >
            {ic}
          </button>
        ))}
      </div>

      <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={save}>
        保存
      </button>

      {confirmDel && (
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button className="btn btn-ghost btn-block" onClick={() => setConfirmDel(false)}>
            取消
          </button>
          <button
            className="btn btn-danger btn-block"
            onClick={async () => {
              if (cat) await db.categories.delete(cat.id)
              onDone('已删除分类')
            }}
          >
            确认删除
          </button>
        </div>
      )}
      <div style={{ height: 8 }} />
    </Sheet>
  )
}
