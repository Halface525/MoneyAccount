import dayjs from 'dayjs'

export const CURRENCY = '¥'

/** 分 -> 元字符串，保留两位小数 */
export function fen2yuan(fen: number): string {
  return (fen / 100).toFixed(2)
}

/** 分 -> 带千分位的元，不带符号 */
export function money(fen: number, opts: { decimals?: boolean } = {}): string {
  const decimals = opts.decimals ?? true
  const v = Math.abs(fen) / 100
  const s = v.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })
  return s
}

/** 分 -> ¥1,234.00 */
export function moneySign(fen: number): string {
  return (fen < 0 ? '-' : '') + CURRENCY + money(fen)
}

export function parseAmount(input: string): number {
  if (!input) return 0
  const n = Number(input)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export const todayStr = () => dayjs().format('YYYY-MM-DD')
export const nowTime = () => dayjs().format('HH:mm')
export const monthOf = (date: string) => date.slice(0, 7)

export function formatDateLabel(date: string): string {
  const d = dayjs(date)
  const today = dayjs()
  if (d.isSame(today, 'day')) return '今天'
  if (d.isSame(today.subtract(1, 'day'), 'day')) return '昨天'
  if (d.isSame(today.subtract(2, 'day'), 'day')) return '前天'
  if (d.isSame(today, 'year')) return d.format('M月D日')
  return d.format('YYYY年M月D日')
}

export function weekdayLabel(date: string): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dayjs(date).day()]
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-')
  const now = dayjs()
  if (now.format('YYYY') === y) return `${Number(m)}月`
  return `${y}年${Number(m)}月`
}

export function percent(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, (part / total) * 100)
}

export function uid(prefix = ''): string {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  )
}

export function daysInMonth(month: string): number {
  return dayjs(month + '-01').daysInMonth()
}
