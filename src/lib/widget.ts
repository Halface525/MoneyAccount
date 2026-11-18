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
  /** 打卡热力图：7 行（周一→周日），每行 18 周，-1 表示未来 */
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

/**
 * 热力图横跨的周数。
 * 去掉快捷按钮后，热力图区域大约 2.5:1，18 周（约四个月）正好铺满，
 * 格子也能保持正方形；周数太多反而会把格子缩小。
 */
const HEAT_WEEKS = 18

function buildHeatmap(transactions: Transaction[], now: dayjs.Dayjs) {
  // 每天记了几笔（只看支出，和 App 里的打卡热力图口径一致）
  const countByDay = new Map<string, number>()
  for (const t of transactions) {
    if (t.type !== 'expense') continue
    countByDay.set(t.date, (countByDay.get(t.date) ?? 0) + 1)
  }

  // 周一为一周的第一天：把今天所在周对齐到周一，再往前推 24 周
  const mondayOffset = (now.day() + 6) % 7
  const start = now.subtract(mondayOffset, 'day').subtract(HEAT_WEEKS - 1, 'week')

  const rows: number[][] = Array.from({ length: 7 }, () => [])
  for (let w = 0; w < HEAT_WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const date = start.add(w, 'week').add(d, 'day')
      rows[d].push(date.isAfter(now, 'day') ? -1 : (countByDay.get(date.format('YYYY-MM-DD')) ?? 0))
    }
  }

  // 连续记账天数：从今天往前数，今天没记就算 0
  let streak = 0
  for (let i = 0; i < 3650; i++) {
    const day = now.subtract(i, 'day').format('YYYY-MM-DD')
    if ((countByDay.get(day) ?? 0) > 0) streak++
    else break
  }

  return { heatRows: rows.map((r) => r.join(',')).join(';'), streak }
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

  const heat = buildHeatmap(transactions, now)

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
