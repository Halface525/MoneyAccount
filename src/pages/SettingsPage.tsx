import { useRef, useState } from 'react'
import { db } from '../db'
import { useApp } from '../lib/store'
import { saveTextFile } from '../lib/native'
import Sheet from '../components/Sheet'
import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconTrash,
  IconUpload,
} from '../components/Icons'
import type { Account, Budget, Category, Recurring, Transaction } from '../db/types'

type Backup = {
  app: string
  version: number
  exportedAt: string
  transactions: Transaction[]
  accounts: Account[]
  categories: Category[]
  budgets: Budget[]
  recurring: Recurring[]
}

export default function SettingsPage({
  back,
  navigate,
}: {
  back: () => void
  navigate: (to: string) => void
}) {
  const { theme, setTheme, transactions, accounts, categories, recurring, toast } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [importing, setImporting] = useState(false)

  const exportJson = async () => {
    const data: Backup = {
      app: 'money-account',
      version: 1,
      exportedAt: new Date().toISOString(),
      transactions: await db.transactions.toArray(),
      accounts: await db.accounts.toArray(),
      categories: await db.categories.toArray(),
      budgets: await db.budgets.toArray(),
      recurring: await db.recurring.toArray(),
    }
    await saveTextFile(
      `随手记备份-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(data, null, 2),
      'application/json',
    )
    toast('已导出备份文件')
  }

  const exportCsv = async () => {
    const txs = await db.transactions.toArray()
    const cats = await db.categories.toArray()
    const accs = await db.accounts.toArray()
    const cm = new Map(cats.map((c) => [c.id, c.name]))
    const am = new Map(accs.map((a) => [a.id, a.name]))
    const header = '日期,时间,类型,分类,金额,账户,备注\n'
    const rows = txs
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((t) => {
        const type = t.type === 'expense' ? '支出' : t.type === 'income' ? '收入' : '转账'
        const note = (t.note ?? '').replace(/,/g, '，')
        return `${t.date},${t.time ?? ''},${type},${cm.get(t.categoryId) ?? ''},${(t.amount / 100).toFixed(2)},${am.get(t.accountId) ?? ''},${note}`
      })
      .join('\n')
    await saveTextFile(
      `随手记明细-${new Date().toISOString().slice(0, 10)}.csv`,
      '\ufeff' + header + rows,
      'text/csv;charset=utf-8',
    )
    toast('已导出 CSV')
  }

  const doImport = async (file: File) => {
    try {
      setImporting(true)
      const text = await file.text()
      const data = JSON.parse(text) as Backup
      if (data.app !== 'money-account' || !Array.isArray(data.transactions)) {
        toast('文件格式不正确')
        return
      }
      await db.transaction('rw', [db.transactions, db.accounts, db.categories, db.budgets, db.recurring], async () => {
        if (data.categories?.length) {
          await db.categories.clear()
          await db.categories.bulkPut(data.categories)
        }
        if (data.accounts?.length) {
          await db.accounts.clear()
          await db.accounts.bulkPut(data.accounts)
        }
        await db.transactions.clear()
        if (data.transactions.length) await db.transactions.bulkPut(data.transactions)
        await db.budgets.clear()
        if (data.budgets?.length) await db.budgets.bulkPut(data.budgets)
        await db.recurring.clear()
        if (data.recurring?.length) await db.recurring.bulkPut(data.recurring)
      })
      toast(`已恢复 ${data.transactions.length} 笔记录`)
    } catch {
      toast('导入失败，请检查文件')
    } finally {
      setImporting(false)
    }
  }

  const clearAll = async () => {
    await db.transactions.clear()
    setConfirmClear(false)
    toast('已清空全部记账')
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="row" style={{ gap: 4 }}>
          <button className="back-btn" onClick={back}>
            <IconChevronLeft size={18} />
          </button>
          <h1>设置</h1>
        </div>
      </header>

      <section>
        <div className="section-head">
          <h2>外观</h2>
        </div>
        <div className="card card-pad">
          <div className="segmented" style={{ width: '100%' }}>
            {(
              [
                ['auto', '跟随系统'],
                ['light', '浅色'],
                ['dark', '深色'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                className={theme === k ? 'active' : ''}
                style={{ flex: 1 }}
                onClick={() => setTheme(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>数据</h2>
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          <button className="list-row" onClick={exportJson}>
            <span style={{ color: 'var(--accent-text)' }}><IconDownload size={17} /></span>
            <span className="lbl">导出备份（JSON）</span>
            <span className="val" style={{ fontFamily: 'var(--font-sans)' }}>{transactions.length} 笔</span>
            <IconChevronRight size={16} className="chev" />
          </button>
          <button className="list-row" onClick={exportCsv}>
            <span style={{ color: 'var(--positive)' }}><IconDownload size={17} /></span>
            <span className="lbl">导出表格（CSV）</span>
            <IconChevronRight size={16} className="chev" />
          </button>
          <button className="list-row" onClick={() => fileRef.current?.click()}>
            <span style={{ color: 'var(--text-2)' }}><IconUpload size={17} /></span>
            <span className="lbl">{importing ? '正在导入…' : '从备份恢复'}</span>
            <IconChevronRight size={16} className="chev" />
          </button>
          <button className="list-row" onClick={() => setConfirmClear(true)}>
            <span style={{ color: 'var(--negative)' }}><IconTrash size={17} /></span>
            <span className="lbl danger">清空全部记账</span>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) doImport(f)
            e.target.value = ''
          }}
        />
        <div className="small muted" style={{ padding: '9px 4px 0' }}>
          恢复会覆盖当前全部数据，建议先导出备份。
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>管理</h2>
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          <button className="list-row" onClick={() => navigate('/categories')}>
            <span>🏷️</span>
            <span className="lbl">分类管理</span>
            <span className="val" style={{ fontFamily: 'var(--font-sans)' }}>{categories.length} 个</span>
            <IconChevronRight size={16} className="chev" />
          </button>
          <button className="list-row" onClick={() => navigate('/accounts')}>
            <span>💳</span>
            <span className="lbl">账户管理</span>
            <span className="val" style={{ fontFamily: 'var(--font-sans)' }}>{accounts.length} 个</span>
            <IconChevronRight size={16} className="chev" />
          </button>
          <button className="list-row" onClick={() => navigate('/recurring')}>
            <span>🔁</span>
            <span className="lbl">周期账单</span>
            <span className="val" style={{ fontFamily: 'var(--font-sans)' }}>{recurring.length} 条</span>
            <IconChevronRight size={16} className="chev" />
          </button>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>关于</h2>
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="list-row">
            <span className="lbl">版本</span>
            <span className="val">1.0.0</span>
          </div>
          <div className="list-row">
            <span className="lbl">数据存储</span>
            <span className="val" style={{ fontFamily: 'var(--font-sans)' }}>本机 IndexedDB</span>
          </div>
          <div className="list-row">
            <span className="lbl">云端同步</span>
            <span className="val" style={{ fontFamily: 'var(--font-sans)' }}>未启用</span>
          </div>
        </div>
      </section>

      <div className="row" style={{ justifyContent: 'center', marginTop: 22 }}>
        <span className="small muted">记账 · 简单一点就好</span>
      </div>

      {confirmClear && (
        <Sheet title="清空全部记账？" onClose={() => setConfirmClear(false)}>
          <p style={{ color: 'var(--text-2)', fontSize: 14, padding: '0 4px 14px', lineHeight: 1.6 }}>
            将删除 <b style={{ color: 'var(--text)' }}>{transactions.length}</b> 笔记录。
            账户、分类和预算会保留。建议先导出备份。
          </p>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-ghost btn-block" onClick={exportJson}>
              先备份
            </button>
            <button
              className="btn btn-danger btn-block"
              onClick={clearAll}
            >
              确认清空
            </button>
          </div>
        </Sheet>
      )}

    </div>
  )
}
