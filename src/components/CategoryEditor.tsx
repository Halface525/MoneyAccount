import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db'
import { useApp } from '../lib/store'
import { uid } from '../lib/format'
import Sheet from './Sheet'
import { IconTrash } from './Icons'
import type { Category } from '../db/types'

export const CATEGORY_ICONS = [
  '🍜','🍚','☕️','🍰','🥤','🍺','🛒','🛍️','👕','👟','🧴','💄','💊','🏥','🚇','🚌','🚕','⛽️','🚲','✈️',
  '🏠','💡','💧','📱','🌐','🎮','🎬','🎵','📚','✏️','🏀','🏃','🐱','🐶','🎁','🧧','💰','📈','💼','🧾',
  '📦','🔧','🪙','💳','🏦','🎓','👶','💍','🧳','🥗','🐟','🌸','🎂','🧸','🎸','⚽️','🚗','🧺','🫐','🍇',
]

/**
 * 常用的 23 个：6 列 × 4 行（最后一个是自定义输入框），
 * 其余收进「更多图标」，面板默认不会是一整屏密密麻麻的小格子。
 */
export const PRIMARY_ICONS = [
  '🍜','🍚','☕️','🍰','🥤','🛒',
  '🛍️','👕','👟','🚇','🚕','✈️',
  '🏠','💡','📱','🎮','📚','🎁',
  '💊','🐱','💰','📈','💼',
]

export const EXTRA_ICONS = CATEGORY_ICONS.filter((ic) => !PRIMARY_ICONS.includes(ic))

/** 只留 8 个，一排就放得下，不用横向滑 */
export const CATEGORY_COLORS = [
  '#E8825A','#DFA84F','#C4715F','#D9708F','#C287B4','#7A86C9','#5FA8BC','#8AA85C',
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
  const [icon, setIcon] = useState(cat?.icon ?? '📦')
  const [color, setColor] = useState(cat?.color ?? CATEGORY_COLORS[1])
  const [customIcon, setCustomIcon] = useState('')
  // 编辑的是老分类、而它的图标在「更多」里时，默认展开，免得看不到当前选中
  const [showMore, setShowMore] = useState(!!cat && EXTRA_ICONS.includes(cat.icon))
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

  // 图标是否来自小白框里的自定义输入（用于给它也画上选中态）
  const customActive = !!customIcon && customIcon === icon

  // 老分类用的颜色不在这 8 个里时，临时把它排到第一个，保证看得出当前选的是哪个
  const colorOptions = useMemo(
    () => (CATEGORY_COLORS.includes(color) ? CATEGORY_COLORS : [color, ...CATEGORY_COLORS]),
    [color],
  )

  const iconCell = (ic: string) => (
    <button
      key={ic}
      className={'ce-icon' + (icon === ic ? ' on' : '')}
      style={icon === ic ? { background: color + '26', borderColor: color } : undefined}
      onClick={() => setIcon(ic)}
      aria-label={ic}
    >
      {ic}
    </button>
  )

  return (
    <Sheet
      title={cat ? '编辑分类' : '新建分类'}
      onClose={onClose}
      right={
        cat ? (
          <button className="icon-btn" onClick={askDelete} aria-label="删除分类">
            <IconTrash size={15} />
          </button>
        ) : undefined
      }
    >
      {/* 一进面板就能看到「这个分类长什么样」，名字和预览放同一行 */}
      <div className="ce-head">
        <div className="cat-icon ce-preview" style={{ background: color + '1f' }}>
          {icon}
        </div>
        <input
          className="ce-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="分类名称，如 早餐"
          maxLength={8}
        />
      </div>

      <div className="ce-colors">
        {colorOptions.map((c) => (
          <button
            key={c}
            className={'ce-dot' + (color === c ? ' on' : '')}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={`颜色 ${c}`}
          />
        ))}
      </div>

      <div className="ce-icons">
        {/* 想用别的 emoji 直接在这个小格里输入；放最前面，不用滚到底才找得到 */}
        <label
          className={'ce-icon ce-custom' + (customActive ? ' on' : '')}
          style={customActive ? { background: color + '26', borderColor: color } : undefined}
        >
          <input
            value={customIcon}
            onChange={(e) => {
              // 只留第一个字形：emoji 有组合字符，得按字形切而不是按码点
              const next = firstGlyph(e.target.value)
              setCustomIcon(next)
              if (next) setIcon(next)
            }}
            placeholder="😀"
            maxLength={4}
            aria-label="自定义图标"
          />
        </label>
        {PRIMARY_ICONS.map(iconCell)}
        {showMore && EXTRA_ICONS.map(iconCell)}
      </div>

      <div className="ce-more-row">
        <button className="ce-more" onClick={() => setShowMore((v) => !v)}>
          {showMore ? '收起' : `更多图标 · ${EXTRA_ICONS.length}`}
        </button>
        <span className="ce-hint">第一个格子可粘贴任意 emoji</span>
      </div>

      <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={save}>
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

/** 取字符串的第一个「字形」（兼容带修饰符、ZWJ 组合的 emoji） */
function firstGlyph(input: string): string {
  const text = input.replace(/\s/g, '')
  if (!text) return ''
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (Seg) {
    const it = new Seg('zh', { granularity: 'grapheme' }).segment(text)[Symbol.iterator]()
    const first = it.next()
    return first.done ? '' : first.value.segment
  }
  return Array.from(text)[0] ?? ''
}
