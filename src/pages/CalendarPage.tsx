import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useApp } from '../lib/store'
import { compactMoney, formatMonth, money, weekdayLabel } from '../lib/format'
import { lunarLabel } from '../lib/lunar'
import TransactionRow from '../components/TransactionRow'
import { IconChevronLeft, IconChevronRight } from '../components/Icons'

type Cell = {
  date: string
  day: number
  inMonth: boolean
  expense: number
  income: number
  count: number
}

const WEEK_HEAD = ['日', '一', '二', '三', '四', '五', '六']

/**
 * 记账日历：一月一屏，每格写当天的支出/收入，点开看那天的明细。
 * 排版按中文日历的惯例：周日排在第一列，格子里公历在上、农历在下。
 */
export default function CalendarPage({ back }: { back: () => void }) {
  const { transactions } = useApp()
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'))
  const [picked, setPicked] = useState<string | null>(null)

  const today = dayjs().format('YYYY-MM-DD')
  const isCurrent = month === dayjs().format('YYYY-MM')

  const cells = useMemo<Cell[]>(() => {
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
  }, [transactions, month])

  const summary = useMemo(() => {
    let expense = 0
    let income = 0
    let days = 0
    for (const c of cells) {
      if (!c.inMonth) continue
      expense += c.expense
      income += c.income
      if (c.count > 0) days += 1
    }
    return { expense, income, days }
  }, [cells])

  // 当月最大单日支出，用来给有账的日子加深度
  const maxExpense = useMemo(
    () => Math.max(1, ...cells.filter((c) => c.inMonth).map((c) => c.expense)),
    [cells],
  )

  const pickedTx = useMemo(() => {
    if (!picked) return []
    return transactions
      .filter((t) => t.date === picked)
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [transactions, picked])

  const shift = (n: number) => {
    setMonth(dayjs(month + '-01').add(n, 'month').format('YYYY-MM'))
    setPicked(null)
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="row" style={{ gap: 4 }}>
          <button className="back-btn" onClick={back}>
            <IconChevronLeft size={18} />
          </button>
          <div>
            <h1>日历</h1>
            <div className="sub">
              {summary.days} 天有记录 · 支出 ¥{money(summary.expense)}
            </div>
          </div>
        </div>
        <div className="month-switch">
          <button onClick={() => shift(-1)}>
            <IconChevronLeft size={17} />
          </button>
          <span className="m">{formatMonth(month)}</span>
          <button onClick={() => shift(1)} disabled={isCurrent} style={{ opacity: isCurrent ? 0.25 : 1 }}>
            <IconChevronRight size={17} />
          </button>
        </div>
      </header>

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
                onClick={() => setPicked(picked === c.date ? null : c.date)}
              >
                <span className="d">{c.day}</span>
                <span className="l">{c.inMonth ? lunarLabel(c.date) : ''}</span>
                <span className="e">{compactMoney(c.expense)}</span>
                <span className="i">{compactMoney(c.income)}</span>
              </button>
            )
          })}
        </div>

        <div className="cal-legend">
          <span>
            <i className="k-e" />支出
          </span>
          <span>
            <i className="k-i" />收入
          </span>
          <span className="muted">点某天看明细</span>
        </div>
      </div>

      {picked && (
        <section className="section">
          <div className="section-head">
            <h2>
              {dayjs(picked).format('M月D日')} {weekdayLabel(picked)}
            </h2>
            <span className="more">{pickedTx.length} 笔</span>
          </div>
          <div className="card">
            {pickedTx.length === 0 ? (
              <div className="empty" style={{ padding: '26px 16px' }}>
                <span className="em">🗓</span>
                <div className="t">这天没有记账</div>
              </div>
            ) : (
              pickedTx.map((t) => <TransactionRow key={t.id} tx={t} />)
            )}
          </div>
        </section>
      )}

      {!picked && (
        <div className="card empty" style={{ marginTop: 14, padding: '22px 16px' }}>
          <span className="em">🗓</span>
          <div className="t">点某一天</div>
          <div className="s">看看那天记了几笔、花了多少</div>
        </div>
      )}

      <div style={{ height: 8 }} />
    </div>
  )
}
