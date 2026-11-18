import dayjs from 'dayjs'
import type { Transaction } from '../db/types'

export type HeatmapMetric = 'count' | 'amount'

export interface HeatmapDay {
  date: string
  count: number
  amount: number
  future: boolean
}

export interface HeatmapData {
  days: HeatmapDay[]
  weeks: number
  /** 第一格（周一）的日期 */
  start: dayjs.Dayjs
  streak: number
  longest: number
  monthDays: number
}

/**
 * 记账打卡热力图的数据计算，App 里的 Heatmap 组件和桌面组件共用这一份，
 * 保证两边的深浅规则完全一致。
 */
export function buildHeatmapData(transactions: Transaction[], weeks = 19): HeatmapData {
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

  const days: HeatmapDay[] = []
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

  return { days, weeks, start, streak, longest, monthDays }
}

/** 当前窗口里的最大值，至少为 1，避免除零 */
export function heatmapMax(days: HeatmapDay[], metric: HeatmapMetric): number {
  return Math.max(1, ...days.map((d) => (metric === 'count' ? d.count : d.amount)))
}

/** 和 App 里完全一致的 0-4 档深浅 */
export function heatmapLevel(day: HeatmapDay, max: number, metric: HeatmapMetric): number {
  const v = metric === 'count' ? day.count : day.amount
  if (v <= 0) return 0
  const r = v / max
  if (r > 0.75) return 4
  if (r > 0.5) return 3
  if (r > 0.25) return 2
  return 1
}
