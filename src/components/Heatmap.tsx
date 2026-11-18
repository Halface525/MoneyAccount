import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { money } from '../lib/format'
import { buildHeatmapData, heatmapLevel, heatmapMax, type HeatmapDay } from '../lib/heatmap'
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

  // 数据计算和桌面组件共用 src/lib/heatmap.ts，保证两边深浅规则一致
  const { days, start, streak, longest, monthDays } = useMemo(
    () => buildHeatmapData(transactions, weeks),
    [transactions, weeks],
  )

  const monthLabels = useMemo(() => {
    // 月份标签：只标「这一列里包含某月 1 号」的位置
    const labels: { index: number; label: string }[] = []
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const day = start.add(w * 7 + d, 'day')
        if (day.date() === 1) {
          labels.push({ index: w, label: day.format('M月') })
          break
        }
      }
    }
    return labels
  }, [start, weeks])

  const max = heatmapMax(days, metric)
  const level = (d: HeatmapDay) => heatmapLevel(d, max, metric)

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
