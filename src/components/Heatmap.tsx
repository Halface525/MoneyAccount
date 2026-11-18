import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { money } from '../lib/format'
import type { Transaction } from '../db/types'

type Metric = 'count' | 'amount'

/**
 * 记账打卡热力图：像 GitHub / LeetCode 的贡献图一样，
 * 每一格是一天，颜色越深表示那天记得越多。
 */
export default function Heatmap({
  transactions,
  weeks = 19,
}: {
  transactions: Transaction[]
  weeks?: number
}) {
  const [metric, setMetric] = useState<Metric>('count')
  const [picked, setPicked] = useState<string | null>(null)

  const { days, monthLabels, streak, longest, monthDays } = useMemo(() => {
    const today = dayjs()
    const dow = (today.day() + 6) % 7 // 周一为 0
    const end = today.add(6 - dow, 'day') // 本周周日
    const start = end.subtract(weeks * 7 - 1, 'day')

    const byDay = new Map<string, { count: number; amount: number }>()
    transactions.forEach((t) => {
      const cur = byDay.get(t.date) ?? { count: 0, amount: 0 }
      cur.count += 1
      if (t.type === 'expense') cur.amount += t.amount
      byDay.set(t.date, cur)
    })

    const days: { date: string; count: number; amount: number; future: boolean }[] = []
    for (let i = 0; i < weeks * 7; i++) {
      const d = start.add(i, 'day')
      const key = d.format('YYYY-MM-DD')
      const v = byDay.get(key)
      days.push({
        date: key,
        count: v?.count ?? 0,
        amount: v?.amount ?? 0,
        future: d.isAfter(today, 'day'),
      })
    }

    // 月份标签：只标「这一列里包含某月 1 号」的位置
    const monthLabels: { index: number; label: string }[] = []
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const day = start.add(w * 7 + d, 'day')
        if (day.date() === 1) {
          monthLabels.push({ index: w, label: day.format('M月') })
          break
        }
      }
    }

    // 连续记账：从今天（或昨天）往前数
    const recorded = new Set<string>()
    transactions.forEach((t) => recorded.add(t.date))
    let streak = 0
    let cursor = dayjs()
    if (!recorded.has(cursor.format('YYYY-MM-DD'))) cursor = cursor.subtract(1, 'day')
    while (recorded.has(cursor.format('YYYY-MM-DD'))) {
      streak += 1
      cursor = cursor.subtract(1, 'day')
    }

    // 历史最长连续
    const sorted = [...recorded].sort()
    let longest = 0
    let run = 0
    let prev: string | null = null
    sorted.forEach((d) => {
      if (prev && dayjs(d).diff(dayjs(prev), 'day') === 1) run += 1
      else run = 1
      longest = Math.max(longest, run)
      prev = d
    })

    const monthKey = dayjs().format('YYYY-MM')
    const monthDays = [...recorded].filter((d) => d.startsWith(monthKey)).length

    return { days, monthLabels, streak, longest, monthDays }
  }, [transactions, weeks])

  const max = Math.max(
    1,
    ...days.map((d) => (metric === 'count' ? d.count : d.amount)),
  )

  const level = (d: { count: number; amount: number }) => {
    const v = metric === 'count' ? d.count : d.amount
    if (v <= 0) return 0
    const r = v / max
    if (r > 0.75) return 4
    if (r > 0.5) return 3
    if (r > 0.25) return 2
    return 1
  }

  const pickedDay = picked ? days.find((d) => d.date === picked) : null

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="small muted">
          {metric === 'count' ? '颜色越深，当天记得越多' : '颜色越深，当天花得越多'}
        </span>
        <div className="segmented" style={{ transform: 'scale(0.8)', transformOrigin: 'right' }}>
          <button className={metric === 'count' ? 'active' : ''} onClick={() => setMetric('count')}>
            笔数
          </button>
          <button className={metric === 'amount' ? 'active' : ''} onClick={() => setMetric('amount')}>
            金额
          </button>
        </div>
      </div>

      <div className="hm-wrap">
        <div className="hm-grid">
          {days.map((d) => {
            const lv = level(d)
            const isToday = d.date === dayjs().format('YYYY-MM-DD')
            return (
              <button
                key={d.date}
                className={
                  'hm-cell' +
                  (lv ? ' l' + lv : '') +
                  (d.future ? ' future' : '') +
                  (isToday ? ' today' : '') +
                  (picked === d.date ? ' picked' : '')
                }
                disabled={d.future}
                onClick={() => setPicked(picked === d.date ? null : d.date)}
                aria-label={d.date}
              />
            )
          })}
        </div>
        <div className="hm-months" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>
          {Array.from({ length: weeks }, (_, w) => {
            const hit = monthLabels.find((m) => m.index === w)
            return <span key={w}>{hit?.label ?? ''}</span>
          })}
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
        <span className="small muted">少</span>
        {[0, 1, 2, 3, 4].map((lv) => (
          <span key={lv} className={'hm-dot' + (lv ? ' l' + lv : '')} />
        ))}
        <span className="small muted">多</span>
      </div>

      {pickedDay && (
        <div className="hm-detail">
          <b>{dayjs(pickedDay.date).format('M月D日')}</b>
          <span className="muted">
            {pickedDay.count > 0
              ? ` · ${pickedDay.count} 笔${pickedDay.amount > 0 ? ` · 花 ¥${money(pickedDay.amount)}` : ''}`
              : ' · 这天没有记账'}
          </span>
        </div>
      )}

      <div className="hm-stats">
        <div>
          <div className="v">{streak}</div>
          <div className="k">连续记账</div>
        </div>
        <div>
          <div className="v">{monthDays}</div>
          <div className="k">本月已记</div>
        </div>
        <div>
          <div className="v">{longest}</div>
          <div className="k">最长连续</div>
        </div>
      </div>
    </div>
  )
}
