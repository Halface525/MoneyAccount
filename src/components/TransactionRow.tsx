import { useApp } from '../lib/store'
import { money } from '../lib/format'
import type { Transaction } from '../db/types'
import { IconRepeat } from './Icons'

export default function TransactionRow({
  tx,
  onClick,
  showAccount = true,
}: {
  tx: Transaction
  onClick?: () => void
  showAccount?: boolean
}) {
  const { catMap, accMap } = useApp()
  const cat = catMap.get(tx.categoryId)
  const acc = accMap.get(tx.accountId)
  const toAcc = tx.toAccountId ? accMap.get(tx.toAccountId) : undefined

  const icon = tx.type === 'transfer' ? '🔄' : (cat?.icon ?? '📦')
  const color = tx.type === 'transfer' ? '#9C86C9' : (cat?.color ?? '#A2968A')

  let title: string
  if (tx.type === 'transfer') {
    title = `${acc?.name ?? '账户'} → ${toAcc?.name ?? '账户'}`
  } else {
    title = cat?.name ?? '未分类'
  }

  const sub = [showAccount && acc?.name, tx.note, tx.time]
    .filter(Boolean)
    .join(' · ')

  return (
    <button className="tx-row" onClick={onClick}>
      <span
        className="cat-icon"
        style={{ background: color + '1f', color }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="tx-main">
        <span className="tx-title">
          {title}
          {tx.recurringId && (
            <IconRepeat size={11} className="muted" />
          )}
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
}
