export type TxType = 'expense' | 'income' | 'transfer'

export interface Transaction {
  id: string
  type: TxType
  /** 金额，单位：分 */
  amount: number
  categoryId: string
  accountId: string
  /** 仅转账使用 */
  toAccountId?: string
  note?: string
  /** YYYY-MM-DD */
  date: string
  /** HH:mm */
  time?: string
  createdAt: number
  updatedAt: number
  /** 由周期账单自动生成 */
  recurringId?: string
}

export type AccountKind = 'cash' | 'ewallet' | 'bank' | 'credit' | 'other'

export interface Account {
  id: string
  name: string
  kind: AccountKind
  icon: string
  color: string
  /** 初始余额，单位：分 */
  initialBalance: number
  order: number
  archived?: boolean
  /** 信用卡额度，单位：分 */
  creditLimit?: number
}

export interface Category {
  id: string
  name: string
  icon: string
  type: 'expense' | 'income'
  color: string
  order: number
  archived?: boolean
}

export interface Budget {
  /** `${month}::${categoryId}`，总预算 categoryId 为 'total' */
  id: string
  month: string
  categoryId: string
  amount: number
}

export type RecurringFreq = 'monthly' | 'weekly' | 'daily' | 'yearly'

export interface Recurring {
  id: string
  name: string
  type: Exclude<TxType, 'transfer'>
  amount: number
  categoryId: string
  accountId: string
  note?: string
  freq: RecurringFreq
  /** 每月几号 / 每周几(0-6) */
  day: number
  startDate: string
  /** 最近一次自动记账的日期 */
  lastRun?: string
  enabled: boolean
  createdAt: number
}

export interface Setting {
  key: string
  value: unknown
}
