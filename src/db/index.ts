import Dexie, { type Table } from 'dexie'
import type { Account, Budget, Category, Recurring, Setting, Transaction } from './types'
import { seedAccounts, seedCategories } from './seed'

class MoneyDB extends Dexie {
  transactions!: Table<Transaction, string>
  accounts!: Table<Account, string>
  categories!: Table<Category, string>
  budgets!: Table<Budget, string>
  recurring!: Table<Recurring, string>
  settings!: Table<Setting, string>

  constructor() {
    super('money-account')
    this.version(1).stores({
      transactions: 'id, date, type, categoryId, accountId, createdAt',
      accounts: 'id, order',
      categories: 'id, type, order',
      budgets: 'id, month',
      recurring: 'id, enabled',
      settings: 'key',
    })
    this.on('populate', () => {
      this.categories.bulkAdd(seedCategories())
      this.accounts.bulkAdd(seedAccounts())
    })
  }
}

export const db = new MoneyDB()

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value })
}
