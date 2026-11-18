import { useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { db } from '../db'
import { useApp } from '../lib/store'
import { formatDateLabel, money, moneySigned, nowTime, parseAmount, todayStr, uid } from '../lib/format'
import Sheet from '../components/Sheet'
import CategoryEditor from '../components/CategoryEditor'
import {
  IconCalendar,
  IconCheck,
  IconTransfer,
  IconTrash,
} from '../components/Icons'
import { AppIcon } from '../lib/appIcons'
import { lightTap } from '../lib/native'
import type { Category, Transaction, TxType } from '../db/types'

type Mode = TxType

export default function AddPage({
  back,
  editId,
  presetType,
  presetCat,
  navigate,
}: {
  back: () => void
  editId?: string
  presetType?: Mode
  presetCat?: string
  navigate: (to: string) => void
}) {
  const { categories, accounts, accMap, accountBalances, toast } = useApp()

  const [mode, setMode] = useState<Mode>(presetType ?? 'expense')
  const [raw, setRaw] = useState('')
  const [categoryId, setCategoryId] = useState(presetCat ?? '')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [date, setDate] = useState(todayStr())
  const [time, setTime] = useState(nowTime())
  const [note, setNote] = useState('')
  const [sheet, setSheet] = useState<'account' | 'toAccount' | 'date' | 'note' | null>(null)
  const [catEditor, setCatEditor] = useState<Category | 'new' | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [loaded, setLoaded] = useState(!editId)
  const [saving, setSaving] = useState(false)

  const originalRef = useRef<Transaction | null>(null)
  const holdRef = useRef<number>(0)

  const expenseCats = useMemo(
    () => categories.filter((c) => c.type === 'expense' && !c.archived),
    [categories],
  )
  const incomeCats = useMemo(
    () => categories.filter((c) => c.type === 'income' && !c.archived),
    [categories],
  )

  // 首次进入：设置默认账户 / 分类
  useEffect(() => {
    if (!accounts.length) return
    if (!accountId) setAccountId(accounts[0].id)
    if (!toAccountId && accounts.length > 1) setToAccountId(accounts[1].id)
  }, [accounts, accountId, toAccountId])

  useEffect(() => {
    if (!categoryId) {
      const first = mode === 'income' ? incomeCats[0] : expenseCats[0]
      if (first) setCategoryId(first.id)
    }
  }, [mode, expenseCats, incomeCats, categoryId])

  // 编辑模式加载
  useEffect(() => {
    if (!editId) return
    db.transactions.get(editId).then((tx) => {
      if (!tx) return
      originalRef.current = tx
      setMode(tx.type)
      setRaw((tx.amount / 100).toFixed(2).replace(/\.00$/, ''))
      setCategoryId(tx.categoryId)
      setAccountId(tx.accountId)
      setToAccountId(tx.toAccountId ?? '')
      setDate(tx.date)
      setTime(tx.time ?? nowTime())
      setNote(tx.note ?? '')
      setLoaded(true)
    })
  }, [editId])

  const amount = parseAmount(raw)

  const press = (k: string) => {
    if (k === 'del') {
      setRaw((r) => r.slice(0, -1))
      return
    }
    if (k === 'clear') {
      setRaw('')
      return
    }
    if (k === '.') {
      if (raw.includes('.')) return
      setRaw((r) => (r === '' ? '0.' : r + '.'))
      return
    }
    if (raw.includes('.')) {
      const dec = raw.split('.')[1] ?? ''
      if (dec.length >= 2) return
    }
    if (raw === '0' && k !== '.') {
      setRaw(k)
      return
    }
    if (raw.replace('.', '').length >= 9 && k !== '.') return
    setRaw((r) => r + k)
  }

  const save = async () => {
    if (saving) return
    if (amount <= 0) {
      toast('请输入金额')
      return
    }
    if (!accountId) {
      toast('请选择账户')
      return
    }
    if (mode === 'transfer' && (!toAccountId || toAccountId === accountId)) {
      toast('选择不同的转出与转入账户')
      return
    }
    if (mode !== 'transfer' && !categoryId) {
      toast('请选择分类')
      return
    }

    setSaving(true)
    const now = Date.now()
    const orig = originalRef.current
    const payload: Transaction = {
      id: orig?.id ?? uid('t_'),
      type: mode,
      amount,
      categoryId: mode === 'transfer' ? 'c_transfer' : categoryId,
      accountId,
      toAccountId: mode === 'transfer' ? toAccountId : undefined,
      note: note.trim() || undefined,
      date,
      time,
      createdAt: orig?.createdAt ?? now,
      updatedAt: now,
      recurringId: orig?.recurringId,
    }
    await db.transactions.put(payload)
    void lightTap()
    toast(orig ? '已更新' : `已记账 ¥${money(amount)}`)
    back()
  }

  const remove = async () => {
    if (!originalRef.current) return
    await db.transactions.delete(originalRef.current.id)
    toast('已删除')
    back()
  }

  const catList = mode === 'income' ? incomeCats : expenseCats
  const acc = accMap.get(accountId)
  const toAcc = accMap.get(toAccountId)

  // 长按删除更安全，这里用弹 sheet 确认
  const [confirmDel, setConfirmDel] = useState(false)

  return (
    <div className="add-page">
      <div className="add-header">
        <div className="row" style={{ gap: 2 }}>
          <button className="icon-btn" onClick={back} aria-label="返回">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        </div>
        <div className="segmented">
          {(['expense', 'income', 'transfer'] as Mode[]).map((m) => (
            <button
              key={m}
              className={mode === m ? 'active' : ''}
              onClick={() => {
                setMode(m)
                setCategoryId('')
              }}
            >
              {m === 'expense' ? '支出' : m === 'income' ? '收入' : '转账'}
            </button>
          ))}
        </div>
        <div style={{ width: 38 }}>
          {editId ? (
            <button
              className="icon-btn"
              onClick={() => setConfirmDel(true)}
              aria-label="删除"
            >
              <IconTrash size={17} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="add-amount">
        <span className="cur">¥</span>
        <span className={'val' + (raw === '' ? ' placeholder' : '')}>
          {raw === '' ? '0.00' : raw}
        </span>
      </div>

      <div className="add-meta">
        <button className="chip strong" onClick={() => setSheet('account')}>
          <span className="em">
            <AppIcon name={acc?.icon ?? 'credit-card'} size={15} color={acc?.color} />
          </span>
          {acc?.name ?? '选择账户'}
        </button>
        {mode === 'transfer' && (
          <>
            <span className="chip" style={{ padding: '6px 4px', background: 'none', border: 'none', boxShadow: 'none' }}>
              →
            </span>
            <button className="chip strong" onClick={() => setSheet('toAccount')}>
              <span className="em">
                <AppIcon name={toAcc?.icon ?? 'credit-card'} size={15} color={toAcc?.color} />
              </span>
              {toAcc?.name ?? '转入账户'}
            </button>
          </>
        )}
        <button className="chip" onClick={() => setSheet('date')}>
          <IconCalendar size={13} />
          {formatDateLabel(date)}
        </button>
        <button className="chip" onClick={() => { setNoteDraft(note); setSheet('note') }}>
          <AppIcon name="notebook-pen" size={13} />
          {note ? ' ' + note : ' 备注'}
        </button>
      </div>

      {mode === 'transfer' ? (
        <div style={{ flex: 1, padding: '4px 16px', overflowY: 'auto' }}>
          <div
            className="card card-pad"
            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div
                className="cat-icon"
                style={{ margin: '0 auto 6px', width: 42, height: 42, background: (acc?.color ?? '#999') + '1f' }}
              >
                <AppIcon name={acc?.icon ?? 'credit-card'} size={20} color={acc?.color} />
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{acc?.name}</div>
              <div className="small muted">
                {moneySigned(accountBalances.get(accountId) ?? 0)}
              </div>
            </div>
            <div style={{ color: 'var(--accent)', flex: 'none' }}>
              <IconTransfer size={22} />
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div
                className="cat-icon"
                style={{ margin: '0 auto 6px', width: 42, height: 42, background: (toAcc?.color ?? '#999') + '1f' }}
              >
                <AppIcon name={toAcc?.icon ?? 'credit-card'} size={20} color={toAcc?.color} />
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{toAcc?.name}</div>
              <div className="small muted">
                {moneySigned(accountBalances.get(toAccountId) ?? 0)}
              </div>
            </div>
          </div>
          <div
            className="small"
            style={{ textAlign: 'center', color: 'var(--text-3)', marginTop: 12 }}
          >
            账户之间转账，不计入收支统计
          </div>
        </div>
      ) : (
        <div className="cat-grid">
          {catList.map((c) => {
            const sel = c.id === categoryId
            return (
              <button
                key={c.id}
                className={'cat-cell' + (sel ? ' sel' : '')}
                style={{
                  ['--cat-color' as string]: c.color,
                  ['--tint' as string]: c.color + '1f',
                }}
                onClick={() => setCategoryId(c.id)}
                onPointerDown={() => {
                  // 长按分类进入编辑，可以改名、换图标或删掉
                  holdRef.current = window.setTimeout(() => {
                    holdRef.current = 0
                    setCatEditor(c)
                  }, 500)
                }}
                onPointerUp={() => {
                  if (holdRef.current) {
                    clearTimeout(holdRef.current)
                    holdRef.current = 0
                  }
                }}
                onPointerLeave={() => {
                  if (holdRef.current) {
                    clearTimeout(holdRef.current)
                    holdRef.current = 0
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setCatEditor(c)
                }}
              >
                <span
                  className="box"
                  style={sel ? { background: c.color } : undefined}
                >
                  <AppIcon name={c.icon} size={20} color={sel ? '#fff' : c.color} />
                </span>
                <span className="nm">{c.name}</span>
              </button>
            )
          })}
          <button
            className="cat-cell add"
            onClick={() => setCatEditor('new')}
            aria-label="新建分类"
          >
            <span className="box">＋</span>
            <span className="nm">添加</span>
          </button>
        </div>
      )}

      <div className="keypad">
        <div className="keys">
          {['1', '2', '3', 'del', '4', '5', '6', 'clear', '7', '8', '9'].map((k) => (
            <button
              key={k}
              className={'key' + (k === 'del' || k === 'clear' ? ' fn' : '')}
              onClick={() => press(k)}
            >
              {k === 'del' ? '⌫' : k === 'clear' ? 'C' : k}
            </button>
          ))}
          <button
            className="key accent"
            style={{ gridRow: 'span 2', gridColumn: '4', height: 'auto', fontSize: 16, fontWeight: 600 }}
            onClick={save}
            disabled={saving}
          >
            {editId ? '保存' : '完成'}
          </button>
          <button className="key" onClick={() => press('00')}>
            00
          </button>
          <button className="key" onClick={() => press('0')}>
            0
          </button>
          <button className="key" onClick={() => press('.')}>
            .
          </button>
        </div>
      </div>

      {sheet === 'account' && (
        <Sheet title="选择账户" onClose={() => setSheet(null)}>
          <div className="acc-list" style={{ paddingBottom: 8 }}>
            {accounts.map((a) => (
              <button
                key={a.id}
                className="acc-row"
                onClick={() => { setAccountId(a.id); setSheet(null) }}
                style={a.id === accountId ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined}
              >
                <span className="cat-icon" style={{ background: a.color + '1f' }}>
                  <AppIcon name={a.icon} size={17} color={a.color} />
                </span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <span className="nm">{a.name}</span>
                </span>
                {a.id === accountId && <IconCheck size={17} />}
              </button>
            ))}
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => { setSheet(null); navigate('/accounts') }}>
              管理账户
            </button>
          </div>
        </Sheet>
      )}

      {sheet === 'toAccount' && (
        <Sheet title="转入账户" onClose={() => setSheet(null)}>
          <div className="acc-list" style={{ paddingBottom: 8 }}>
            {accounts.filter((a) => a.id !== accountId).map((a) => (
              <button
                key={a.id}
                className="acc-row"
                onClick={() => { setToAccountId(a.id); setSheet(null) }}
                style={a.id === toAccountId ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : undefined}
              >
                <span className="cat-icon" style={{ background: a.color + '1f' }}>
                  <AppIcon name={a.icon} size={17} color={a.color} />
                </span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <span className="nm">{a.name}</span>
                </span>
                {a.id === toAccountId && <IconCheck size={17} />}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {sheet === 'date' && (
        <Sheet title="选择日期" onClose={() => setSheet(null)}>
          <input
            type="date"
            value={date}
            max={dayjs().add(1, 'year').format('YYYY-MM-DD')}
            onChange={(e) => setDate(e.target.value)}
            className="field"
            style={{ textAlign: 'left', fontSize: 16, width: '100%' }}
          />
          <div className="pill-row" style={{ marginTop: 4 }}>
            {[0, 1, 2, 3].map((d) => {
              const v = dayjs().subtract(d, 'day').format('YYYY-MM-DD')
              return (
                <button
                  key={d}
                  className={'pill' + (date === v ? ' active' : '')}
                  onClick={() => setDate(v)}
                >
                  {formatDateLabel(v)}
                </button>
              )
            })}
          </div>
          <div className="field">
            <span className="lbl">时间</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={() => setSheet(null)}>
            完成
          </button>
        </Sheet>
      )}

      {catEditor && (
        <CategoryEditor
          cat={catEditor === 'new' ? null : catEditor}
          type={mode === 'income' ? 'income' : 'expense'}
          onClose={() => setCatEditor(null)}
          onDone={(msg, created) => {
            toast(msg)
            setCatEditor(null)
            // 新建后直接选中它，省得再点一次
            if (created) setCategoryId(created.id)
          }}
        />
      )}

      {sheet === 'note' && (
        <Sheet title="备注" onClose={() => setSheet(null)}>
          <input
            className="field"
            style={{ textAlign: 'left', fontSize: 16, width: '100%' }}
            placeholder="写点什么…"
            value={noteDraft}
            autoFocus
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setNote(noteDraft); setSheet(null) }
            }}
          />
          <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={() => { setNote(noteDraft); setSheet(null) }}>
            完成
          </button>
        </Sheet>
      )}

      {confirmDel && (
        <Sheet title="删除这笔记录？" onClose={() => setConfirmDel(false)}>
          <p style={{ color: 'var(--text-2)', fontSize: 14, padding: '0 4px 14px' }}>
            删除后无法恢复。
          </p>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-ghost btn-block" onClick={() => setConfirmDel(false)}>取消</button>
            <button className="btn btn-danger btn-block" onClick={remove}>
              删除
            </button>
          </div>
        </Sheet>
      )}

      {!loaded && <div className="toast">加载中…</div>}
    </div>
  )
}
