/**
 * 农历日期，用于月历里没有记账的那几天。
 *
 * 用浏览器内置的中国农历历法（Intl 的 `-u-ca-chinese`），不引任何日历库：
 * 农历表有几十年数据，自己维护既容易算错又要多几十 KB。安卓 11+ 的 WebView
 * 都支持，取不到就返回空串，月历照常显示公历。
 */

const DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
]

let formatter: Intl.DateTimeFormat | null | undefined

function getFormatter(): Intl.DateTimeFormat | null {
  if (formatter !== undefined) return formatter
  try {
    formatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      month: 'long',
      day: 'numeric',
    })
  } catch {
    formatter = null
  }
  return formatter
}

const cache = new Map<string, string>()

/**
 * 2026-10-27 -> '十八'
 * 农历初一显示月份名（'十月'、'闰六月'），这是中文日历的通行写法。
 * 不支持农历的环境返回空串。
 */
export function lunarLabel(date: string): string {
  const hit = cache.get(date)
  if (hit !== undefined) return hit

  let out = ''
  const fmt = getFormatter()
  if (fmt) {
    try {
      const parts = fmt.formatToParts(new Date(date + 'T12:00:00'))
      const month = parts.find((p) => p.type === 'month')?.value ?? ''
      const day = Number(parts.find((p) => p.type === 'day')?.value ?? 0)
      if (day === 1) out = month
      else if (day >= 1 && day <= 30) out = DAY_NAMES[day - 1]
    } catch {
      out = ''
    }
  }

  cache.set(date, out)
  return out
}
