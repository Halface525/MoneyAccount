import dayjs from 'dayjs'

export const CURRENCY = '¥'

/** 分 -> 元字符串，保留两位小数 */
export function fen2yuan(fen: number): string {
  return (fen / 100).toFixed(2)
}

/**
 * 分 -> 带千分位的元。
 * 默认保留两位小数（金额永远不该丢掉角分）；只有明确传 decimals:false
 * 的概览类数字才四舍五入成整数。
 * 负数会保留负号——任何调用方都不该自己再 Math.abs 一次。
 */
export function money(fen: number, opts: { decimals?: boolean } = {}): string {
  const decimals = opts.decimals ?? true
  // fen === 0 也覆盖 -0，否则 toLocaleString 会输出 "-0.00"
  const safe = !Number.isFinite(fen) || fen === 0 ? 0 : fen
  return (safe / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })
}

/** 分 -> ¥1,234.00（负数带负号） */
export function moneySign(fen: number): string {
  return CURRENCY + money(fen)
}

/** 分 -> -¥1,234.00，负号在货币符号前 */
export function moneySigned(fen: number, opts: { decimals?: boolean } = {}): string {
  const s = money(fen, opts)
  return s.startsWith('-') ? '-' + CURRENCY + s.slice(1) : CURRENCY + s
}

/**
 * 把金额切成整数和小数两段，方便把角分渲染得小一号。
 * 1223500 -> { int: '12,235', dec: '.00' }
 */
export function splitMoney(fen: number): { int: string; dec: string } {
  const s = money(fen)
  const dot = s.lastIndexOf('.')
  if (dot < 0) return { int: s, dec: '' }
  return { int: s.slice(0, dot), dec: s.slice(dot) }
}

/** 按时间给一句问候，让首页更像「你的」而不是冷冰冰的仪表盘 */
export function greeting(): string {
  const h = dayjs().hour()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  if (h < 23) return '晚上好'
  return '夜深了'
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

/**
 * 月历格子里用的紧凑金额：位数不够时自动省掉小数，再不够就用「万」。
 * 12450 -> '124.5'，1234567 -> '1.2w'，0 -> ''
 * 常规列表和详情页仍然用 money()，只有面积很小的格子才用它。
 */
export function compactMoney(fen: number): string {
  if (!Number.isFinite(fen) || fen <= 0) return ''
  const yuan = Math.abs(fen) / 100
  const sign = fen < 0 ? '-' : ''
  if (yuan >= 10000) {
    const w = yuan / 10000
    return sign + (w >= 10 ? Math.round(w) : Math.round(w * 10) / 10) + 'w'
  }
  if (yuan >= 1000) return sign + Math.round(yuan)
  if (yuan >= 100) return sign + (Math.round(yuan * 10) / 10)
  return sign + (Math.round(yuan * 100) / 100)
}
