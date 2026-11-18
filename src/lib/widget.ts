/**
 * 桌面小组件的数据桥。
 *
 * 小组件跑在桌面启动器的进程里，用的是 RemoteViews，读不到 WebView 的
 * IndexedDB，也没法跑 React。所以这里把「组件要显示的几个数字」算好，
 * 通过自定义原生插件交过去，由原生侧写进 SharedPreferences 并刷新组件。
 *
 * 浏览器里所有函数都是空操作，和 native.ts 的约定一致。
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import dayjs from 'dayjs'
import type { Budget, Transaction } from '../db/types'
import { buildHeatmapData, heatmapLevel, heatmapMax } from './heatmap'

/** 组件需要的最小数据集，金额单位统一是「分」 */
export interface WidgetSnapshot {
  /** YYYY-MM-DD，用来判断快照是不是今天的 */
  today: string
  /** YYYY-MM，用来判断预算是不是本月的 */
  month: string
  todayExpense: number
  todayIncome: number
  monthExpense: number
  /** 本月总预算，0 表示没设置 */
  monthBudget: number
  /** 打卡热力图：7 行（周一→周日），每行 19 周，0-4 是深浅档位，-1 表示未来 */
  heatRows: string
  /** 连续记账天数 */
  streak: number
  theme: 'light' | 'dark'
  updatedAt: number
}

interface WidgetPlugin {
  update(options: { snapshot: WidgetSnapshot }): Promise<void>
}

const Widget = registerPlugin<WidgetPlugin>('Widget')

/** 和 App 里的 Heatmap 组件保持一致 */
const HEAT_WEEKS = 19

function buildHeatmap(transactions: Transaction[]) {
  // 直接复用 App 里的计算逻辑，保证组件和统计页的深浅规则完全一致
  const data = buildHeatmapData(transactions, HEAT_WEEKS)

  // 组件固定用「金额」视图：同一天花得越多颜色越深
  const max = heatmapMax(data.days, 'amount')
  const rows: number[][] = Array.from({ length: 7 }, () => [])
  for (let w = 0; w < HEAT_WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const day = data.days[w * 7 + d]
      rows[d].push(day.future ? -1 : heatmapLevel(day, max, 'amount'))
    }
  }

  return { heatRows: rows.map((r) => r.join(',')).join(';'), streak: data.streak }
}

export function buildSnapshot(
  transactions: Transaction[],
  budgets: Budget[],
  theme: 'auto' | 'light' | 'dark',
): WidgetSnapshot {
  const now = dayjs()
  const today = now.format('YYYY-MM-DD')
  const month = now.format('YYYY-MM')

  let todayExpense = 0
  let todayIncome = 0
  let monthExpense = 0

  for (const t of transactions) {
    if (!t.date.startsWith(month)) continue
    if (t.type === 'expense') {
      monthExpense += t.amount
      if (t.date === today) todayExpense += t.amount
    } else if (t.type === 'income' && t.date === today) {
      todayIncome += t.amount
    }
  }

  const monthBudget =
    budgets.find((b) => b.month === month && b.categoryId === 'total')?.amount ?? 0

  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme

  const heat = buildHeatmap(transactions)

  return {
    today,
    month,
    todayExpense,
    todayIncome,
    monthExpense,
    monthBudget,
    heatRows: heat.heatRows,
    streak: heat.streak,
    theme: resolved,
    updatedAt: Date.now(),
  }
}

/** 把最新快照推给原生组件；浏览器里直接返回 */
export async function syncWidget(
  transactions: Transaction[],
  budgets: Budget[],
  theme: 'auto' | 'light' | 'dark',
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await Widget.update({ snapshot: buildSnapshot(transactions, budgets, theme) })
  } catch (err) {
    console.warn('[widget] 同步桌面组件失败', err)
  }
}
