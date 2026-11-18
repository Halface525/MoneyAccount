import dayjs from 'dayjs'
import { db } from '../db'
import { uid } from './format'
import type { Recurring } from '../db/types'

/** 计算某条周期账单在 start..end 之间应生成的日期 */
export function dueDates(rule: Recurring, end: dayjs.Dayjs): string[] {
  const out: string[] = []
  const start = dayjs(rule.startDate)
  if (start.isAfter(end, 'day')) return out

  let cursor = rule.lastRun ? dayjs(rule.lastRun).add(1, 'day') : start
  if (cursor.isBefore(start, 'day')) cursor = start

  // 最多回补 400 天，防止异常数据卡死
  let guard = 0
  while (!cursor.isAfter(end, 'day') && guard < 400) {
    guard++
    let hit = false
    if (rule.freq === 'daily') hit = true
    else if (rule.freq === 'weekly') hit = cursor.day() === rule.day
    else if (rule.freq === 'monthly') {
      const dim = cursor.daysInMonth()
      const target = Math.min(rule.day, dim)
      hit = cursor.date() === target
    } else if (rule.freq === 'yearly') {
      hit = cursor.month() === start.month() && cursor.date() === rule.day
    }
    if (hit) out.push(cursor.format('YYYY-MM-DD'))
    cursor = cursor.add(1, 'day')
  }
  return out
}

/** 启动时把到期的周期账单补齐为真实交易 */
export async function runRecurringCatchUp(): Promise<number> {
  const rules = await db.recurring.toArray()
  const today = dayjs()
  let created = 0

  for (const rule of rules) {
    if (!rule.enabled) continue
    const dates = dueDates(rule, today)
    if (dates.length === 0) continue
    const now = Date.now()
    const txs = dates.map((d) => ({
      id: uid('t_'),
      type: rule.type,
      amount: rule.amount,
      categoryId: rule.categoryId,
      accountId: rule.accountId,
      note: rule.note ? `${rule.note}` : rule.name,
      date: d,
      time: '08:00',
      createdAt: now,
      updatedAt: now,
      recurringId: rule.id,
    }))
    await db.transactions.bulkAdd(txs)
    await db.recurring.update(rule.id, { lastRun: dates[dates.length - 1] })
    created += txs.length
  }
  return created
}
