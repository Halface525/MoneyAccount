import { useRef, useState, type TouchEvent } from 'react'
import { useApp } from '../lib/store'
import { money } from '../lib/format'
import type { Transaction } from '../db/types'
import { IconRepeat, IconTrash } from './Icons'
import { AppIcon } from '../lib/appIcons'

const ACTION_WIDTH = 76

export default function TransactionRow({
  tx,
  onClick,
  onDelete,
  showAccount = true,
}: {
  tx: Transaction
  onClick?: () => void
  /** 传入后支持左滑露出删除按钮（明细页用） */
  onDelete?: () => void
  showAccount?: boolean
}) {
  const { catMap, accMap } = useApp()
  const cat = catMap.get(tx.categoryId)
  const acc = accMap.get(tx.accountId)
  const toAcc = tx.toAccountId ? accMap.get(tx.toAccountId) : undefined

  const icon = tx.type === 'transfer' ? 'arrow-left-right' : (cat?.icon ?? 'package')
  const color = tx.type === 'transfer' ? '#9C86C9' : (cat?.color ?? '#A2968A')

  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startRef = useRef<{ x: number; y: number; base: number } | null>(null)
  const movedRef = useRef(false)

  const handleClick = () => {
    if (dx < 0) {
      setDx(0)
      return
    }
    onClick?.()
  }

  const onTouchStart = (e: TouchEvent) => {
    if (!onDelete) return
    const t = e.touches[0]
    startRef.current = { x: t.clientX, y: t.clientY, base: dx }
    movedRef.current = false
  }

  const onTouchMove = (e: TouchEvent) => {
    if (!onDelete || !startRef.current) return
    const t = e.touches[0]
    const mx = t.clientX - startRef.current.x
    const my = t.clientY - startRef.current.y
    // 先判断方向：横向才接管，纵向留给页面滚动
    if (!movedRef.current && Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) {
      movedRef.current = true
      setDragging(true)
    }
    if (!movedRef.current) return
    setDx(Math.max(-ACTION_WIDTH, Math.min(0, startRef.current.base + mx)))
  }

  const endSwipe = () => {
    if (!onDelete || !startRef.current) return
    if (movedRef.current) setDx(dx <= -ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0)
    setDragging(false)
    startRef.current = null
  }

  let title: string
  if (tx.type === 'transfer') {
    title = `${acc?.name ?? '账户'} → ${toAcc?.name ?? '账户'}`
  } else {
    title = cat?.name ?? '未分类'
  }

  const sub = [showAccount && acc?.name, tx.note, tx.time]
    .filter(Boolean)
    .join(' · ')

  const row = (
    <button
      className="tx-row"
      onClick={handleClick}
      style={
        onDelete
          ? {
              transform: `translateX(${dx}px)`,
              transition: dragging ? 'none' : 'transform 0.18s ease',
            }
          : undefined
      }
    >
      <span
        className="cat-icon"
        style={{ background: color + '1f', color }}
        aria-hidden
      >
        <AppIcon name={icon} size={18} color={color} />
      </span>
      <span className="tx-main">
        <span className="tx-title">
          {title}
          {tx.recurringId && <IconRepeat size={11} className="muted" />}
        </span>
        <span className="tx-sub">{sub || '无备注'}</span>
      </span>
      <span
        className={
          'tx-amount' +
          (tx.type === 'income' ? ' income' : tx.type === 'transfer' ? ' transfer' : '')
        }
      >
        {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}¥{money(tx.amount)}
      </span>
    </button>
  )

  if (!onDelete) return row

  return (
    <div
      className="tx-swipe"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={endSwipe}
      onTouchCancel={endSwipe}
    >
      <div className="tx-actions">
        <button
          className="tx-delete"
          onClick={() => {
            setDx(0)
            onDelete()
          }}
          aria-label="删除这笔记录"
        >
          <IconTrash size={19} />
        </button>
      </div>
      {row}
    </div>
  )
}
