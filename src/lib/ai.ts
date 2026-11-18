import dayjs from 'dayjs'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { getSetting, setSetting } from '../db'
import type { Account, Category, Transaction, TxType } from '../db/types'
import type { ParsedDraft } from './nlp'
import { money } from './format'

/** 安卓里用原生网络栈发请求，浏览器预览时用 fetch */
const isNative = Capacitor.isNativePlatform()

/* ------------------------------------------------------------------ */
/* 配置                                                                 */
/* ------------------------------------------------------------------ */

export const AI_ENDPOINT = 'https://api.deepseek.com/chat/completions'

/**
 * 只用 Flash：记账解析是短输入短输出，Flash 快一个数量级、便宜十倍，
 * 准确率对这种结构化抽取完全够。V4-Pro 留给长上下文重推理的场景。
 */
export const AI_MODELS = [
  { id: 'deepseek-flash', label: 'DeepSeek-V4.1-Flash', hint: '最新版，够快也够准' },
] as const

export interface AiConfig {
  /** 用户自己的 DeepSeek API Key，只存在本机 */
  apiKey: string
  model: string
  enabled: boolean
}

const CFG_KEY = 'ai.config'

const DEFAULT_CONFIG: AiConfig = {
  apiKey: '',
  model: AI_MODELS[0].id,
  enabled: true,
}

let cached: AiConfig | null = null

export async function loadAiConfig(): Promise<AiConfig> {
  if (cached) return cached
  const saved = await getSetting<Partial<AiConfig> | null>(CFG_KEY, null)
  const merged = { ...DEFAULT_CONFIG, ...(saved ?? {}) }
  // 老版本存过 deepseek-chat / deepseek-reasoner，这两个名字已下线，
  // 统一挪到现在的 Flash，免得用户升级后报错还得自己找原因
  if (!AI_MODELS.some((m) => m.id === merged.model)) merged.model = DEFAULT_CONFIG.model
  cached = merged
  return cached
}

export async function saveAiConfig(patch: Partial<AiConfig>): Promise<AiConfig> {
  const next = { ...(cached ?? (await loadAiConfig())), ...patch }
  cached = next
  await setSetting(CFG_KEY, next)
  return next
}

/** 配好了 Key 才走模型，否则退回本地规则 */
export function aiReady(cfg: AiConfig | null): boolean {
  return Boolean(cfg && cfg.enabled && cfg.apiKey.trim().length >= 16)
}

/* ------------------------------------------------------------------ */
/* 提示词                                                               */
/* ------------------------------------------------------------------ */

export interface AiContext {
  categories: Category[]
  accounts: Account[]
  transactions: Transaction[]
  accountBalances: Map<string, number>
  /** 没识别出账户时的兜底账户名 */
  defaultAccount?: string
}

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string }

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 只把「这几个字」发出去，别把整本账扔给模型 */
function monthDigest(ctx: AiContext, now: dayjs.Dayjs): string {
  const month = now.format('YYYY-MM')
  const rows = ctx.transactions.filter((t) => t.date.startsWith(month))
  const expense = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const income = rows.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenseCount = rows.filter((t) => t.type === 'expense').length

  const byCat = new Map<string, number>()
  for (const t of rows) {
    if (t.type !== 'expense') continue
    byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount)
  }
  const catName = new Map(ctx.categories.map((c) => [c.id, c.name]))
  const top = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, v]) => `${catName.get(id) ?? '其他'} ¥${money(v)}`)
    .join('、')

  const balances = ctx.accounts
    .filter((a) => !a.archived)
    .map((a) => `${a.name} ¥${money(ctx.accountBalances.get(a.id) ?? 0)}`)
    .join('、')

  return [
    `本月（${month}）支出 ¥${money(expense)}（${expenseCount} 笔），收入 ¥${money(income)}`,
    top ? `本月花得最多：${top}` : '',
    balances ? `各账户余额：${balances}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildMessages(text: string, ctx: AiContext, now: dayjs.Dayjs = dayjs()): ChatMsg[] {
  const expenseCats = ctx.categories
    .filter((c) => c.type === 'expense' && !c.archived)
    .map((c) => c.name)
    .join('、')
  const incomeCats = ctx.categories
    .filter((c) => c.type === 'income' && !c.archived)
    .map((c) => c.name)
    .join('、')
  const accountNames = ctx.accounts
    .filter((a) => !a.archived)
    .map((a) => a.name)
    .join('、')

  const system = `你是「随手记」记账 App 的记账助手。用户会用一句或几句话说自己花了、赚了或转了什么钱，你把它们拆成一条条记账条目，用 JSON 返回。

今天是 ${now.format('YYYY-MM-DD')}（${WEEK[now.day()]}），用户在中国时区。

【支出分类】必须从这些里选：${expenseCats || '其他'}
【收入分类】必须从这些里选：${incomeCats || '其他'}
【账户】必须从这些里选：${accountNames || '现金'}
【默认账户】用户没提账户时用：${ctx.defaultAccount || accountNames || '现金'}

参考信息（不要复述、不要据此修改条目，只用来理解用户的话）：
${monthDigest(ctx, now)}

输出格式，只输出 JSON 对象，不要 markdown 代码块、不要任何解释：
{"reply":"一句话回应，20 字以内","items":[{"type":"expense","amount":25,"category":"餐饮","account":"微信","toAccount":"","date":"${now.format('YYYY-MM-DD')}","time":"","note":"午饭"}]}

字段规则：
- type：expense 花钱、income 收钱、transfer 账户间转账
- amount：单位「元」的纯数字，不带货币符号；"25块5"写成 25.5，"两块五"写成 2.5
- category：上面的分类中文名；type 是 transfer 时留空字符串
- account：付款或收款的账户中文名
- toAccount：只有 transfer 才填转入账户，其余留空字符串
- date：YYYY-MM-DD。"昨天""前天""上周五"都要换算成具体日期；没说就是今天
- time：HH:mm，只有用户明确说了时间才填，否则留空字符串
- note：备注，尽量摘用户原话里的关键词，比如"午饭""打车"，不要超过 10 个字

其他规则：
- 一句话里有几笔就输出几项，不要合并
- 金额只出现一次且明显是总额时，按一笔记；"早饭5块午饭20块"要拆成两笔
- 用户只是在聊天、没有花钱或收钱时，items 给空数组，reply 里友好地回应一句
- 不要编造用户没说的金额：没说金额就把 amount 写成 0，让用户自己补
- **还没真正入账**。reply 别说"已记录""记上了""记好了"，要说"核对一下"这类等用户确认的话；宁可少说，比如"这笔看着对吗"

关于备注：
- note 只写用户原话里跟这笔消费有关的内容
- 用户提到"没填钱""不知道多少""忘了多少钱"时，这是用户在说金额缺失，不要把这句话写进备注`

  return [
    { role: 'system', content: system },
    { role: 'user', content: text },
  ]
}

/* ------------------------------------------------------------------ */
/* 请求                                                                 */
/* ------------------------------------------------------------------ */

export type AiErrorKind = 'no-key' | 'auth' | 'quota' | 'rate' | 'network' | 'format' | 'server'

export class AiError extends Error {
  kind: AiErrorKind
  constructor(kind: AiErrorKind, message: string) {
    super(message)
    this.kind = kind
    this.name = 'AiError'
  }
}

interface RawItem {
  type?: unknown
  amount?: unknown
  category?: unknown
  account?: unknown
  toAccount?: unknown
  date?: unknown
  time?: unknown
  note?: unknown
}

interface RawResult {
  reply?: unknown
  items?: unknown
}

/** 去掉可能出现的 ```json 围栏，再截出最外层的 {} */
function extractJson(raw: string): string {
  const t = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) return t.slice(start, end + 1)
  return t
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function toFen(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100)
}

function normType(v: unknown): TxType {
  const s = str(v).toLowerCase()
  if (s === 'income') return 'income'
  if (s === 'transfer') return 'transfer'
  return 'expense'
}

/** 模型可能写成「餐饮费」「餐饮 🍜」，这里放宽匹配 */
function matchByName<T extends { name: string }>(list: T[], want: string): T | undefined {
  if (!want) return undefined
  const exact = list.find((x) => x.name === want)
  if (exact) return exact
  return list.find((x) => want.includes(x.name) || x.name.includes(want))
}

export interface AiParseResult {
  reply: string
  drafts: ParsedDraft[]
}

/**
 * 发请求。安卓里走 CapacitorHttp（原生网络栈，完全不碰 CORS）；
 * 浏览器预览时走 fetch。
 */
async function post(
  body: string,
  apiKey: string,
  timeoutMs: number,
): Promise<{ status: number; text: string }> {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }

  if (isNative) {
    const res = await CapacitorHttp.post({
      url: AI_ENDPOINT,
      headers,
      data: JSON.parse(body) as Record<string, unknown>,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
    })
    return {
      status: res.status,
      text: typeof res.data === 'string' ? res.data : JSON.stringify(res.data),
    }
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers,
      body,
      signal: ctrl.signal,
    })
    return { status: res.status, text: await res.text() }
  } finally {
    clearTimeout(timer)
  }
}

/** 发一轮对话，返回 assistant 的文本 */
export async function chatOnce(
  messages: ChatMsg[],
  cfg: AiConfig,
  timeoutMs: number,
  opts: { json?: boolean; maxTokens?: number } = {},
): Promise<string> {
  const body = JSON.stringify({
    model: cfg.model,
    messages,
    // 记账只要「看懂这句话并输出 JSON」，不需要思维链；
    // 关掉省掉几千 token 的推理开销，响应也从十几秒降到一两秒
    thinking: { type: 'disabled' },
    temperature: 0,
    max_tokens: opts.maxTokens ?? 1200,
    ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    stream: false,
  })

  let res: { status: number; text: string }
  try {
    res = await post(body, cfg.apiKey.trim(), timeoutMs)
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    throw new AiError('network', aborted ? '请求超时' : '网络连不上')
  }

  if (res.status < 200 || res.status >= 300) {
    if (res.status === 401) throw new AiError('auth', 'API Key 不对')
    if (res.status === 402) throw new AiError('quota', 'DeepSeek 账户余额不足')
    if (res.status === 429) throw new AiError('rate', '请求太频繁，稍后再试')
    throw new AiError('server', `服务返回 ${res.status}`)
  }

  let data: { choices?: { message?: { content?: string } }[] }
  try {
    data = JSON.parse(res.text) as typeof data
  } catch {
    throw new AiError('format', '返回内容不是 JSON')
  }

  const content = data.choices?.[0]?.message?.content
  if (!content) throw new AiError('format', '模型没有返回内容')
  return content
}

/**
 * 调 DeepSeek 把一句话拆成草稿。
 * 只在 AI 侧失败，调用方决定要不要退回本地规则。
 */
export async function askAi(
  text: string,
  ctx: AiContext,
  cfg: AiConfig,
  now: dayjs.Dayjs = dayjs(),
): Promise<AiParseResult> {
  if (!aiReady(cfg)) throw new AiError('no-key', '没有配置 API Key')

  // 关掉思考后一般 1-3 秒回，留 20 秒兜网络抖动
  const timeout = 20000

  const content = await chatOnce(
    buildMessages(text, ctx, now),
    cfg,
    timeout,
    { json: true, maxTokens: 1200 },
  )

  let raw: RawResult
  try {
    raw = JSON.parse(extractJson(content)) as RawResult
  } catch {
    throw new AiError('format', '模型返回的不是合法 JSON')
  }

  const items = Array.isArray(raw.items) ? (raw.items as RawItem[]) : []
  const expense = ctx.categories.filter((c) => c.type === 'expense' && !c.archived)
  const income = ctx.categories.filter((c) => c.type === 'income' && !c.archived)
  const activeAccounts = ctx.accounts.filter((a) => !a.archived)

  const drafts: ParsedDraft[] = []
  for (const it of items) {
    const type = normType(it.type)
    const amount = toFen(it.amount)

    let categoryId = ''
    let guessedCategory = false
    if (type !== 'transfer') {
      const pool = type === 'income' ? income : expense
      const hit = matchByName(pool, str(it.category))
      if (hit) categoryId = hit.id
      else {
        // 猜不准就落到「其他」，让用户一眼看出要改
        const other = pool.find((c) => c.name.startsWith('其他'))
        categoryId = other?.id ?? ''
        guessedCategory = true
      }
    }

    const accHit = matchByName(activeAccounts, str(it.account))
    const accountId = accHit?.id ?? ''

    let toAccountId: string | undefined
    if (type === 'transfer') {
      const toHit = matchByName(activeAccounts, str(it.toAccount))
      toAccountId = toHit?.id
      if (!toAccountId || toAccountId === accountId) continue // 转账两端必须有且不同
    }

    const rawDate = str(it.date)
    const date =
      /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && dayjs(rawDate).isValid()
        ? rawDate
        : now.format('YYYY-MM-DD')

    const rawTime = str(it.time)
    const time = /^\d{1,2}:\d{2}$/.test(rawTime)
      ? rawTime.split(':').map((p) => p.padStart(2, '0')).join(':')
      : undefined

    const missing: ParsedDraft['missing'] = []
    if (!amount) missing.push('amount')
    if (type !== 'transfer' && !categoryId) missing.push('category')
    if (!accountId) missing.push('account')

    drafts.push({
      type,
      amount,
      categoryId,
      accountId,
      toAccountId,
      date,
      time,
      note: str(it.note) || undefined,
      raw: text,
      guessedCategory,
      guessedAccount: !accountId,
      missing,
    })
  }

  return { reply: str(raw.reply), drafts }
}

/** 设置页「测试连接」用，不跑记账提示词，一发一收最省 token */
export async function testAi(cfg: AiConfig): Promise<string> {
  const reply = await chatOnce(
    [
      { role: 'system', content: '你是一个记账 App 的连接测试助手，只回一句简短的问候。' },
      { role: 'user', content: '在吗' },
    ],
    cfg,
    15000,
    { maxTokens: 40 },
  )
  return reply.trim().slice(0, 40)
}
