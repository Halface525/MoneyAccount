import { useEffect, useRef, useState } from 'react'
import { db } from '../db'
import { useApp } from '../lib/store'
import { uid } from '../lib/format'
import Sheet from './Sheet'
import { IconTrash } from './Icons'
import { AppIcon } from '../lib/appIcons'
import { PICKER_ICON_KEYS } from '../db/iconKeys'
import type { Category } from '../db/types'

export const CATEGORY_COLORS = [
  '#E8825A','#DFA84F','#C4715F','#D9708F','#C287B4','#9C86C9','#7A86C9',
  '#6E92C4','#5FA8BC','#5E9BB5','#54A98C','#8AA85C','#B98A5C','#CE6E72','#A2968A',
]

export default function CategoryEditor({
  cat,
  type,
  onClose,
  onDone,
}: {
  cat: Category | null
  type: 'expense' | 'income'
  onClose: () => void
  onDone: (msg: string, created?: Category) => void
}) {
  const { categories, toast } = useApp()
  const [name, setName] = useState(cat?.name ?? '')
  const [icon, setIcon] = useState(cat?.icon ?? 'package')
  const [color, setColor] = useState(cat?.color ?? '#D99A3D')
  const [confirmDel, setConfirmDel] = useState(false)
  const [usedCount, setUsedCount] = useState(0)

  const confirmRef = useRef<HTMLDivElement | null>(null)

  // 确认条在面板底部，弹出来时要滚到可见处，否则容易被当成没反应
  useEffect(() => {
    if (confirmDel) confirmRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [confirmDel])

  const askDelete = async () => {
    if (!cat) return
    const n = await db.transactions.where('categoryId').equals(cat.id).count()
    setUsedCount(n)
    setConfirmDel(true)
  }
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
    onDone(cat ? '已更新分类' : '已添加分类', cat ? undefined : payload)
  }

  return (
    <Sheet
      title={cat ? '编辑分类' : '新建分类'}
      onClose={onClose}
      right={
        cat ? (
          <button className="icon-btn" onClick={askDelete}>
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
        {CATEGORY_COLORS.map((c) => (
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
      <div className="icon-grid">
        {PICKER_ICON_KEYS.map((k) => (
          <button
            key={k}
            className={'icon-pick' + (icon === k ? ' active' : '')}
            onClick={() => setIcon(k)}
            style={{
              background: icon === k ? color + '2a' : 'var(--surface-3)',
              borderColor: icon === k ? color : 'transparent',
            }}
            aria-label={k}
          >
            <AppIcon name={k} size={19} color={icon === k ? color : 'var(--text-2)'} />
          </button>
        ))}
      </div>
      <div className="small muted" style={{ padding: '8px 2px 0', lineHeight: 1.6 }}>
        图标来自 Lucide，和底部导航、设置页是同一套线条风格。
      </div>

      <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={save}>
        保存
      </button>

      {confirmDel && (
        <div ref={confirmRef}>
          {usedCount > 0 && (
            <div
              className="small"
              style={{
                marginTop: 10,
                padding: '9px 12px',
                borderRadius: 12,
                background: 'color-mix(in srgb, var(--negative) 12%, transparent)',
                color: 'var(--negative)',
                lineHeight: 1.6,
              }}
            >
              已有 {usedCount} 笔记账用了这个分类，删掉后这些记录会显示成「未分类」，
              金额和账户都还在。
            </div>
          )}
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
        </div>
      )}
      <div style={{ height: 8 }} />
    </Sheet>
  )
}
