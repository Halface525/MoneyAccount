import { useMemo } from 'react'
import dayjs from 'dayjs'
import type { Transaction } from '../db/types'
import { compactMoney } from '../lib/format'
import { lunarLabel } from '../lib/lunar'

export type CalCell = {
  date: string
  day: number
  inMonth: boolean
  expense: number
  income: number
  count: number
}

const WEEK_HEAD = ['日', '一', '二', '三', '四', '五', '六']

/** 把某个月的记账按天摊平成月历格子，前后补齐到整周 */
export function buildCells(month: string, transactions: Transaction[]): CalCell[] {
  const first = dayjs(month + '-01')
  const days = first.daysInMonth()
  // 前面补上个月末尾，让 1 号落在正确的星期列
  const lead = first.day()
  const start = first.subtract(lead, 'day')
  const total = Math.ceil((lead + days) / 7) * 7

  const byDay = new Map<string, { expense: number; income: number; count: number }>()
  for (const t of transactions) {
    if (!t.date.startsWith(month)) continue
    const cur = byDay.get(t.date) ?? { expense: 0, income: 0, count: 0 }
    if (t.type === 'expense') cur.expense += t.amount
    if (t.type === 'income') cur.income += t.amount
    cur.count += 1
    byDay.set(t.date, cur)
  }

  return Array.from({ length: total }, (_, i) => {
    const d = start.add(i, 'day')
    const key = d.format('YYYY-MM-DD')
    const hit = byDay.get(key)
    return {
      date: key,
      day: d.date(),
      inMonth: d.format('YYYY-MM') === month,
      expense: hit?.expense ?? 0,
      income: hit?.income ?? 0,
      count: hit?.count ?? 0,
    }
  })
}

/**
 * 月历格子：公历日号在上、农历小字在中，支出红、收入绿。
 * 有记账的日子按当天花了多少铺一层深浅，一眼看出哪天花得多。
 *
 * 只负责显示和点击，选中的日期由调用方掌管——日历页拿去展开当天明细，
 * 统计页拿去显示一行摘要。
 */
export default function MonthCalendar({
  month,
  transactions,
  picked,
  onPick,
  legend = true,
}: {
  month: string
  transactions: Transaction[]
  picked: string | null
  onPick: (date: string) => void
  legend?: boolean
}) {
  const today = dayjs().format('YYYY-MM-DD')
  const cells = useMemo(() => buildCells(month, transactions), [month, transactions])

  // 当月最大单日支出，用来给有账的日子加深度
  const maxExpense = useMemo(
    () => Math.max(1, ...cells.filter((c) => c.inMonth).map((c) => c.expense)),
    [cells],
  )

  return (
    <div className="card cal-card">
      <div className="cal-head">
        {WEEK_HEAD.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div className="cal-grid">
        {cells.map((c) => {
          const isToday = c.date === today
          const lv = c.expense > 0 ? Math.max(1, Math.ceil((c.expense / maxExpense) * 3)) : 0
          return (
            <button
              key={c.date}
              className={
                'cal-cell' +
                (c.inMonth ? '' : ' out') +
                (isToday ? ' today' : '') +
                (picked === c.date ? ' picked' : '') +
                (c.count > 0 ? ' has' : '') +
                (lv ? ' l' + lv : '')
              }
              onClick={() => onPick(c.date)}
              aria-label={`${dayjs(c.date).format('M月D日')}，${c.count} 笔`}
            >
              <span className="d">{c.day}</span>
              <span className="l">{c.inMonth ? lunarLabel(c.date) : ''}</span>
              <span className="e">{compactMoney(c.expense)}</span>
              <span className="i">{compactMoney(c.income)}</span>
            </button>
          )
        })}
      </div>

      {legend && (
        <div className="cal-legend">
          <span>
            <i className="k-e" />支出
          </span>
          <span>
            <i className="k-i" />收入
          </span>
          <span className="muted">点某天看明细</span>
        </div>
      )}
    </div>
  )
}
