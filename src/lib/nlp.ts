import dayjs, { type Dayjs } from 'dayjs'
import type { Account, Category, TxType } from '../db/types'

/**
 * 一句话记账的本地解析器。
 *
 * 全部逻辑都在手机上跑，不联网、不调用任何模型：
 * 「昨天午饭 25 微信」→ 支出 / 25.00 / 餐饮 / 微信 / 2024-xx-xx
 *
 * 解析顺序很重要：先把「昨天」「12点」这类时间词抠掉，
 * 否则 12点 里的 12 会被当成金额。
 */

export type MissingField = 'amount' | 'category' | 'account'

export interface ParseContext {
  categories: Category[]
  accounts: Account[]
}

export interface ParsedDraft {
  type: TxType
  /** 分。识别不到时为 0，并带上 missing: ['amount'] */
  amount: number
  categoryId: string
  accountId: string
  toAccountId?: string
  date: string
  time?: string
  note?: string
  /** 原始片段，追问金额时用它再拼一次 */
  raw: string
  /** 分类是按关键词猜的 / 兜底「其他」 */
  guessedCategory: boolean
  guessedAccount: boolean
  missing: MissingField[]
}

/* ------------------------------------------------------------------ */
/* 基础工具                                                             */
/* ------------------------------------------------------------------ */

function pad2(n: number | string): string {
  return String(n).padStart(2, '0')
}

/** 全角转半角，并统一各种标点，后面所有匹配都基于这个结果 */
export function normalizeInput(input: string): string {
  return input
    .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\uffe5/g, '¥')
    .replace(/[\u3000\t]/g, ' ')
    .replace(/[。；;，、]/g, ',')
    .replace(/[!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Span {
  start: number
  end: number
}

function cutSpans(text: string, spans: Span[]): string {
  if (!spans.length) return text
  const sorted = [...spans].sort((a, b) => b.start - a.start)
  let out = text
  for (const sp of sorted) {
    out = out.slice(0, sp.start) + ' ' + out.slice(sp.end)
  }
  return out.replace(/\s+/g, ' ').trim()
}

function overlaps(spans: Span[], s: number, e: number): boolean {
  return spans.some((sp) => s < sp.end && e > sp.start)
}

/* ------------------------------------------------------------------ */
/* 中文数字                                                             */
/* ------------------------------------------------------------------ */

const CN_DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}
const CN_UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }

/** 二十五 / 一百五 / 两千五 / 一万二 —— 只覆盖口语里会出现的写法 */
export function cnToNumber(raw: string): number {
  let total = 0
  let section = 0
  let num = 0
  let lastUnit = 0
  let sawZero = false

  for (const ch of raw) {
    if (ch in CN_DIGITS) {
      const d = CN_DIGITS[ch]
      if (d === 0) sawZero = true
      num = d
      continue
    }
    if (ch in CN_UNITS) {
      const u = CN_UNITS[ch]
      if (num === 0) num = 1
      section += num * u
      lastUnit = u
      num = 0
      continue
    }
    if (ch === '万') {
      section += num
      total += (section || 1) * 10000
      section = 0
      num = 0
      lastUnit = 10000
      continue
    }
  }

  if (!sawZero && lastUnit >= 100 && num > 0 && num < 10) {
    // 一百五 = 150，两千五 = 2500：末尾省略了单位
    section += num * (lastUnit / 10)
  } else {
    section += num
  }
  return total + section
}

/* ------------------------------------------------------------------ */
/* 时间                                                                 */
/* ------------------------------------------------------------------ */

const WEEKDAY_INDEX: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
}

interface TimeResult {
  date: string
  time?: string
  spans: Span[]
}

function extractDateTime(text: string, now: Dayjs): TimeResult {
  const spans: Span[] = []
  let date = now.format('YYYY-MM-DD')
  let time: string | undefined

  const take = (m: RegExpExecArray): boolean => {
    if (overlaps(spans, m.index, m.index + m[0].length)) return false
    spans.push({ start: m.index, end: m.index + m[0].length })
    return true
  }

  // 2024-05-01 / 2024年5月1日
  const abs = /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*[日号]?/.exec(text)
  if (abs && take(abs)) {
    const d = dayjs(`${abs[1]}-${pad2(abs[2])}-${pad2(abs[3])}`)
    if (d.isValid()) date = d.format('YYYY-MM-DD')
  }

  // 5月1日 / 5月1
  if (!spans.length) {
    const md = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/.exec(text)
    if (md && take(md)) {
      const d = dayjs(`${now.year()}-${pad2(md[1])}-${pad2(md[2])}`)
      if (d.isValid()) date = d.format('YYYY-MM-DD')
    }
  }

  // 今天 / 昨天 / 前天 / 明天
  const REL: [RegExp, number][] = [
    [/大前天/, -3],
    [/前天/, -2],
    [/昨天|昨日|昨儿|昨晚|昨晚儿/, -1],
    [/今天|今日|今儿|今晚/, 0],
    [/明天|明日|明早/, 1],
    [/后天/, 2],
  ]
  for (const [re, delta] of REL) {
    const m = re.exec(text)
    if (m && take(m)) {
      date = now.add(delta, 'day').format('YYYY-MM-DD')
      break
    }
  }

  // 周三 / 上周五 / 礼拜天
  const wd = /(上上|上|这|本)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/.exec(text)
  if (wd && take(wd)) {
    const target = WEEKDAY_INDEX[wd[2]]
    let base = now.startOf('day')
    if (wd[1] === '上') base = base.subtract(7, 'day')
    if (wd[1] === '上上') base = base.subtract(14, 'day')
    // 没有前缀时取「最近一次过去的那个星期几」，含今天
    const delta = (base.day() - target + 7) % 7
    date = base.subtract(delta, 'day').format('YYYY-MM-DD')
  }

  // 3号 / 28日（不能是 3号线）
  if (!spans.length || !date.startsWith(now.format('YYYY-MM'))) {
    const dOnly = /(\d{1,2})\s*[日号](?!线)/.exec(text)
    if (dOnly && take(dOnly)) {
      const d = dayjs(`${now.year()}-${pad2(now.month() + 1)}-${pad2(dOnly[1])}`)
      if (d.isValid()) date = d.format('YYYY-MM-DD')
    }
  }

  // 12点 / 下午3点半 / 20:30
  const tm = /(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|夜里|深夜)?\s*(\d{1,2})\s*[点时:：]\s*(半|\d{1,2})?\s*分?/.exec(text)
  if (tm && take(tm)) {
    let h = Number(tm[2])
    const mod = tm[1] ?? ''
    const mm = tm[3] === '半' ? 30 : tm[3] ? Number(tm[3]) : 0
    if (mod === '下午' || mod === '傍晚' || mod === '晚上' || mod === '夜里') {
      if (h < 12) h += 12
    } else if (mod === '深夜' || mod === '凌晨') {
      if (h === 12) h = 0
    } else if (mod === '中午') {
      if (h < 11) h += 12
      if (h === 12 && mm === 0) h = 12
    }
    // 「昨晚11点」里的「晚」已经被日期词吃掉了，这里按整句补一次上下午
    if (!mod && h < 12 && /昨晚|今晚|晚上|夜里|夜间|晚餐|晚饭|夜宵|宵夜/.test(text)) h += 12
    if (h >= 0 && h < 24 && mm >= 0 && mm < 60) {
      time = `${pad2(h)}:${pad2(mm)}`
    }
  }

  return { date, time, spans }
}

/* ------------------------------------------------------------------ */
/* 金额                                                                 */
/* ------------------------------------------------------------------ */

interface AmountHit {
  fen: number
  span: Span
  score: number
}

const QUANTIFIERS = '个只件杯瓶斤两公斤kg张次人份碗袋盒包条套本台部双对颗粒根支瓶罐箱'

function followedByQuantifier(text: string, end: number): boolean {
  const next = text.slice(end, end + 1)
  return Boolean(next) && QUANTIFIERS.includes(next)
}

/** 找出句子里所有像金额的片段，用来判断一句话里是不是有好几笔 */
function extractAmounts(text: string): AmountHit[] {
  const hits: AmountHit[] = []

  const arabic = /(¥\s*)?(\d+(?:\.\d{1,2})?)\s*(万|w|千|k)?\s*(块钱|块|元|圆|rmb|人民币)?/gi
  let m: RegExpExecArray | null
  while ((m = arabic.exec(text))) {
    const num = Number(m[2])
    if (!Number.isFinite(num) || num <= 0) continue
    const unit = (m[4] ?? '').toLowerCase()
    const hasUnit = Boolean(m[3] || unit)
    const hasCurrency = Boolean(m[1])
    let end = m.index + m[0].length

    let value = num
    if (m[3]) {
      const mult = m[3] === '万' || m[3].toLowerCase() === 'w' ? 10000 : 1000
      value *= mult
    }
    // 「25块5」= 25.5，把尾巴并进金额，否则 5 会被当成第二笔
    if (unit === '块' || unit === '元' || unit === '块钱') {
      const tail = /^([0-9一二两三四五六七八九])/.exec(text.slice(end))
      if (tail) {
        value += (CN_DIGITS[tail[1]] ?? Number(tail[1])) / 10
        end += tail[1].length
      }
    }
    if ((!hasUnit && !hasCurrency) && followedByQuantifier(text, end)) continue

    hits.push({
      fen: Math.round(value * 100),
      span: { start: m.index, end },
      score: hasCurrency || hasUnit ? 100 : 30,
    })
  }

  // 中文数字：必须有单位，或者长到足以确认是金额（二十五、一百）
  const cn = /([零〇一二两三四五六七八九十百千万]+)\s*(块钱|块|元|圆)?/g
  while ((m = cn.exec(text))) {
    const unit = m[2]
    const seq = m[1]
    if (!unit) {
      if (seq.length < 2) continue
      if (!/[十百千万]/.test(seq)) continue
    }
    let end = m.index + m[0].length
    if (followedByQuantifier(text, end)) continue
    const value = cnToNumber(seq)
    if (!Number.isFinite(value) || value <= 0) continue
    let final = value
    if (unit === '块' || unit === '元') {
      const tail = /^([一二两三四五六七八九])/.exec(text.slice(end))
      if (tail) {
        final += CN_DIGITS[tail[1]] / 10
        end += tail[1].length
      } else if (/^半/.test(text.slice(end))) {
        final += 0.5
        end += 1
      }
    }
    hits.push({
      fen: Math.round(final * 100),
      span: { start: m.index, end },
      score: unit ? 90 : 40,
    })
  }

  if (!hits.length) return []
  hits.sort((a, b) => a.span.start - b.span.start)
  // 去掉被更长匹配包含的片段（「25块5」里的 5）
  const kept: AmountHit[] = []
  for (const h of hits) {
    const dup = kept.find((k) => h.span.start >= k.span.start && h.span.end <= k.span.end)
    if (dup) {
      if (h.score > dup.score) Object.assign(dup, h)
      continue
    }
    kept.push(h)
  }
  return kept
}

function extractAmount(text: string): AmountHit | null {
  const kept = extractAmounts(text)
  if (!kept.length) return null
  const best = [...kept].sort((a, b) => (b.score - a.score) || (b.span.start - a.span.start))
  return best[0]
}

/* ------------------------------------------------------------------ */
/* 账户 / 分类词表                                                      */
/* ------------------------------------------------------------------ */

const ACCOUNT_WORDS: [string, string[]][] = [
  ['a_wechat', ['微信', 'wechat', 'weixin', 'wx', '零钱']],
  ['a_alipay', ['支付宝', 'alipay', '余额宝', '花呗']],
  ['a_credit', ['信用卡', '贷记卡', '白条', '信用']],
  ['a_bank', ['储蓄卡', '借记卡', '银行卡', '银行', '卡里', '招行', '工行', '建行', '农行', '中行', '交行']],
  ['a_cash', ['现金', '付现', '现钞', '钱包']],
]

const CATEGORY_WORDS: Record<string, string[]> = {
  c_food: [
    '早饭', '早餐', '午饭', '午餐', '中饭', '晚饭', '晚餐', '夜宵', '宵夜', '早饭',
    '外卖', '吃饭', '吃了', '食堂', '餐厅', '饭店', '聚餐', '火锅', '烧烤', '麻辣烫',
    '咖啡', '星巴克', '瑞幸', '奶茶', '喜茶', '饮料', '可乐', '啤酒', '酒',
    '面包', '水果', '零食', '下午茶', '蛋糕', '甜品', '冰淇淋', '麦当劳', '肯德基',
    '汉堡', '披萨', '面条', '米饭', '饺子', '包子', '早餐店', '菜市场', '买菜', '水果店',
  ],
  c_transport: [
    '打车', '滴滴', '出租车', '网约车', '地铁', '公交', '公交车', '公交卡', '高铁',
    '火车', '动车', '机票', '飞机', '加油', '油费', '停车', '停车费', '过路费', '高速费',
    '单车', '共享单车', '骑车', '车票', '地铁卡', '轮渡', '充电桩',
  ],
  c_shopping: [
    '衣服', '裤子', '鞋', '外套', '裙子', '包包', '帽子', '袜子', '淘宝', '京东',
    '拼多多', '网购', '快递', '耳机', '数码', '手机', '手机壳', '电脑', '键盘', '显示器',
    '化妆品', '护肤品', '面膜', '香水', '首饰', '手表', '家居', '家具', '电器', '超市',
  ],
  c_daily: [
    '日用品', '纸巾', '洗衣液', '洗发水', '牙膏', '毛巾', '垃圾袋', '水电', '电费', '水费',
    '燃气', '物业', '话费', '宽带', '快递费', '五金', '清洁',
  ],
  c_fun: [
    '电影', '看电影', '游戏', '点卡', '充值', '会员', '视频会员', '演唱会', '门票',
    'KTV', '唱歌', '酒吧', '桌游', '剧本杀', '旅游', '景点', '演出',
  ],
  c_home: ['房租', '租金', '房贷', '装修', '家电', '家具', '物业费', '押金'],
  c_phone: ['话费', '充话费', '流量', '手机费', '宽带费', '电话费', '话费充值', '流量充值'],
  c_medical: ['医院', '看病', '挂号', '药', '买药', '药店', '体检', '牙医', '疫苗', '门诊'],
  c_study: ['书', '买书', '课程', '网课', '学费', '培训', '考试', '报名费', '文具', '资料'],
  c_gift: ['红包', '礼物', '礼金', '份子钱', '随礼', '请客', '送礼', '人情'],
  c_pet: ['猫粮', '狗粮', '宠物', '猫砂', '洗澡', '驱虫', '兽医', '宠物医院'],
  c_travel: ['旅行', '旅游', '机票', '酒店', '民宿', '景点', '门票', '签证', '度假'],
  c_beauty: ['理发', '剪发', '美发', '美容', '美甲', '护肤', 'spa', '按摩'],
  c_sport: ['健身', '健身房', '游泳', '球', '跑步', '瑜伽', '运动', '球鞋', '羽毛球', '篮球'],
  c_salary: ['工资', '薪水', '发薪', '月薪', '底薪', '发工资'],
  c_bonus: ['奖金', '年终奖', '绩效', '提成', '红包奖励'],
  c_invest: ['理财', '利息', '分红', '基金', '股票', '收益', '卖出'],
  c_parttime: ['兼职', '外快', '私活', '稿费', '副业'],
  c_redpacket: ['收红包', '红包收入', '抢红包', '压岁钱'],
  c_reimburse: ['报销', '退款', '退回', '赔付', '返现'],
  c_other_e: ['其他'],
  c_other_i: ['其他'],
}

const INCOME_WORDS = [
  '工资', '薪水', '发薪', '奖金', '年终奖', '提成', '绩效', '报销', '退款', '退回',
  '收到', '收入', '进账', '入账', '赚了', '赚到', '中奖', '利息', '分红', '收益',
  '收红包', '抢红包', '压岁钱', '外快', '稿费', '私活', '返现', '赔付', '退税', '补贴',
]

const TRANSFER_WORDS = ['转账', '转给', '转到', '转去', '还信用卡', '信用卡还款', '还款到']

/** 「从 A 转/转到 B」这种没有「转账」二字、但明确是内部划转的句子 */
function looksLikeTransfer(text: string, accounts: Account[]): boolean {
  const hit = accounts.filter((a) => text.includes(a.name)).length
  if (hit < 2) return false
  return /(从|把).+(转|存|还|划|充)|(转|存|还|划|充).+(到|进|去|给)/.test(text)
}

interface WordHit {
  span: Span
  value: string
}

function findWord(text: string, words: string[]): WordHit | null {
  let best: WordHit | null = null
  for (const w of words) {
    const idx = text.indexOf(w)
    if (idx < 0) continue
    if (!best || idx < best.span.start || (idx === best.span.start && w.length > best.span.end - best.span.start)) {
      best = { span: { start: idx, end: idx + w.length }, value: w }
    }
  }
  return best
}

function findAccount(text: string, accounts: Account[]): { accountId: string; hit: WordHit } | null {
  // 用户自己的账户名优先，允许改名后依然认得
  const byName = accounts
    .filter((a) => a.name && text.includes(a.name))
    .sort((a, b) => text.indexOf(a.name) - text.indexOf(b.name) || b.name.length - a.name.length)[0]
  if (byName) {
    const idx = text.indexOf(byName.name)
    return {
      accountId: byName.id,
      hit: { span: { start: idx, end: idx + byName.name.length }, value: byName.name },
    }
  }

  let best: { accountId: string; hit: WordHit } | null = null
  for (const [id, words] of ACCOUNT_WORDS) {
    const acc = accounts.find((a) => a.id === id)
    if (!acc) continue
    const hit = findWord(text, words)
    if (!hit) continue
    if (!best || hit.span.start < best.hit.span.start) best = { accountId: id, hit }
  }
  return best
}

function detectType(text: string, hasTwoAccounts: boolean, accounts: Account[] = []): TxType {
  if (hasTwoAccounts && looksLikeTransfer(text, accounts)) return 'transfer'
  if (TRANSFER_WORDS.some((w) => text.includes(w)) && hasTwoAccounts) return 'transfer'
  // 「发红包」是支出，别被「红包」带成收入
  if (/发红包|给红包|包红包|送红包/.test(text)) return 'expense'
  if (INCOME_WORDS.some((w) => text.includes(w))) return 'income'
  return 'expense'
}

function findCategory(
  text: string,
  categories: Category[],
  type: 'expense' | 'income',
): { id: string; guessed: boolean } | null {
  const pool = categories.filter((c) => c.type === type && !c.archived)
  if (!pool.length) return null

  // 用户自定义的分类名（含改名后的）优先级最高
  const byName = pool
    .filter((c) => c.name && c.name !== '其他' && text.includes(c.name))
    .sort((a, b) => b.name.length - a.name.length)[0]
  if (byName) return { id: byName.id, guessed: false }

  const dict = CATEGORY_WORDS
  let best: { id: string; len: number } | null = null
  for (const c of pool) {
    const words = dict[c.id]
    if (!words) continue
    for (const w of words) {
      if (w === '其他') continue
      if (!text.includes(w)) continue
      if (!best || w.length > best.len) best = { id: c.id, len: w.length }
    }
  }
  if (best) return { id: best.id, guessed: false }

  const other = pool.find((c) => c.id === (type === 'income' ? 'c_other_i' : 'c_other_e') || c.name === '其他')
  return other ? { id: other.id, guessed: true } : { id: pool[0].id, guessed: true }
}

/* ------------------------------------------------------------------ */
/* 备注清理                                                             */
/* ------------------------------------------------------------------ */

function cleanNote(text: string): string {
  let out = text
    .replace(/[,.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  out = out.replace(/^(花了|花掉|付了|支付了|支付|收到|收了|赚了|赚到|充值了|充值|交了|买了)\s*/, '')
  out = out.replace(/^(个|只|件|杯|瓶|份|张|条|袋|盒|包|斤|次|台|部|双|套|本)/, '')
  out = out.replace(/(的|了|吧|呀|啊|呢|啦|哦|喔|哈|嘛)+$/g, '')
  // 抠掉金额/账户后剩下的连接词，免得备注变成「还 从」
  out = out
    .split(' ')
    .filter((w) => !['从', '到', '还', '转', '给', '在', '用', '和', '了', '又', '共', '一共'].includes(w))
    .join(' ')
  return out.trim().slice(0, 40)
}

/* ------------------------------------------------------------------ */
/* 主入口                                                               */
/* ------------------------------------------------------------------ */

function hasNumberSignal(s: string): boolean {
  return /[0-9¥]|[零〇一二两三四五六七八九十百千万]/.test(s)
}

/** 所有分类关键词，长的在前，避免「电影」被「看电影」截断 */
const ALL_CATEGORY_WORDS: string[] = [
  ...new Set(Object.values(CATEGORY_WORDS).flat()),
].sort((a, b) => b.length - a.length)

/**
 * 把时间词替换成空格，避免「下午3点」里的 3 被当成金额来源。
 * 只在切句时用，正式解析仍然走 extractDateTime。
 */
function maskTimeWords(text: string): string {
  return text
    .replace(/\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}\s*[日号]?/g, ' ')
    .replace(/\d{1,2}\s*月\s*\d{1,2}\s*[日号]?/g, ' ')
    .replace(/\d{1,2}\s*[点时:：]\s*(半|\d{1,2})?\s*分?/g, ' ')
    .replace(/\d{1,2}\s*[日号](?!线)/g, ' ')
    .replace(/(上上|上|这|本)?\s*(周|星期|礼拜)\s*[一二三四五六日天]/g, ' ')
    .replace(/大前天|前天|昨天|昨日|今天|今日|明天|后天|今晚|昨晚|今早|明早/g, ' ')
}

/**
 * 「地铁4元 打车16元」这种一句话两笔：在前一笔金额已经出现的前提下，
 * 遇到下一个分类词就切开。没有显式「，」「然后」时靠它兜底。
 */
function splitByKeywords(part: string): string[] {
  const out: string[] = []
  let start = 0
  let cursor = 0
  while (cursor < part.length) {
    let hitAt = -1
    let hitLen = 0
    for (const w of ALL_CATEGORY_WORDS) {
      const idx = part.indexOf(w, cursor)
      if (idx < 0) continue
      if (hitAt < 0 || idx < hitAt || (idx === hitAt && w.length > hitLen)) {
        hitAt = idx
        hitLen = w.length
      }
    }
    if (hitAt < 0) break
    if (hitAt > start) {
      const head = part.slice(start, hitAt)
      const tail = part.slice(hitAt)
      const bothHaveAmount =
        extractAmounts(maskTimeWords(head)).some((a) => a.score >= 30) &&
        extractAmounts(maskTimeWords(tail)).some((a) => a.score >= 30)
      if (bothHaveAmount) {
        out.push(part.slice(start, hitAt).trim())
        start = hitAt
      }
    }
    cursor = hitAt + hitLen
  }
  out.push(part.slice(start).trim())
  return out.filter(Boolean)
}

function splitSegments(text: string): string[] {
  const parts = text
    .split(/,+|\n+|然后|还有|另外|接着|再记一笔|再记|又/)
    .map((s) => s.trim())
    .filter(Boolean)

  const out: string[] = []
  let carry = ''
  for (const p of parts) {
    const cur = (carry ? `${carry} ${p}` : p).trim()
    if (hasNumberSignal(cur)) {
      out.push(cur)
      carry = ''
    } else {
      carry = cur
    }
  }
  if (carry) {
    if (out.length) out[out.length - 1] = `${out[out.length - 1]} ${carry}`
    else out.push(carry)
  }
  return out.flatMap(splitByKeywords)
}

function parseSegment(seg: string, ctx: ParseContext, now: Dayjs): ParsedDraft | null {
  const { date, time, spans: timeSpans } = extractDateTime(seg, now)
  let rest = cutSpans(seg, timeSpans)

  const acc = findAccount(rest, ctx.accounts)
  let toAccountId: string | undefined
  if (acc) rest = cutSpans(rest, [acc.hit.span])

  // 转账：「从 A 转到 B」里出现第二个账户
  let accountId = acc?.accountId ?? ''
  if (acc) {
    const second = findAccount(rest, ctx.accounts.filter((a) => a.id !== acc.accountId))
    if (second) {
      toAccountId = second.accountId
      rest = cutSpans(rest, [second.hit.span])
    }
  }

  const amt = extractAmount(rest)
  if (amt) rest = cutSpans(rest, [amt.span])

  const type = detectType(seg, Boolean(accountId && toAccountId), ctx.accounts)
  const cat = type === 'transfer' ? null : findCategory(rest, ctx.categories, type)

  if (type === 'transfer') {
    accountId = acc?.accountId ?? accountId
    toAccountId = toAccountId ?? ''
  }

  if (!amt && !cat && !accountId) return null

  const missing: MissingField[] = []
  if (!amt) missing.push('amount')
  if (type !== 'transfer' && !cat?.id) missing.push('category')
  if (!accountId) missing.push('account')
  if (type === 'transfer' && !toAccountId) missing.push('category')

  return {
    type,
    amount: amt?.fen ?? 0,
    categoryId: type === 'transfer' ? 'c_transfer' : (cat?.id ?? ''),
    accountId,
    toAccountId: type === 'transfer' ? toAccountId : undefined,
    date,
    time,
    note: cleanNote(rest) || undefined,
    raw: seg,
    guessedCategory: cat?.guessed ?? false,
    guessedAccount: !acc,
    missing,
  }
}

/**
 * 把一句话拆成一笔或多笔草稿。
 * 解析不出来的片段会被丢掉；整句都解析不出来时返回空数组。
 */
export function parseLedgerText(input: string, ctx: ParseContext, now: Dayjs = dayjs()): ParsedDraft[] {
  const text = normalizeInput(input)
  if (!text) return []

  const drafts: ParsedDraft[] = []
  for (const seg of splitSegments(text)) {
    const draft = parseSegment(seg, ctx, now)
    if (draft) drafts.push(draft)
  }
  return drafts
}

/** 给输入框下面用的示例，顺手当占位符 */
export const CHAT_EXAMPLES = [
  '午饭 25 微信',
  '打车 12 支付宝',
  '昨天超市 88',
  '发工资 12000',
  '两杯咖啡 46 信用卡',
]

export function fenToYuanInput(fen: number): string {
  if (!fen) return ''
  const s = (fen / 100).toFixed(2)
  return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}
