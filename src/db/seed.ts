import type { Account, Category } from './types'

export const EXPENSE_CATEGORIES: Omit<Category, 'type'>[] = [
  { id: 'c_food', name: '餐饮', icon: '🍜', color: '#FF8A5B', order: 1 },
  { id: 'c_transport', name: '交通', icon: '🚇', color: '#5B9BFF', order: 2 },
  { id: 'c_shopping', name: '购物', icon: '🛍️', color: '#FF6FA5', order: 3 },
  { id: 'c_daily', name: '日用', icon: '🧴', color: '#8B7CF6', order: 4 },
  { id: 'c_fun', name: '娱乐', icon: '🎮', color: '#4FC3A1', order: 5 },
  { id: 'c_home', name: '居住', icon: '🏠', color: '#F2B84B', order: 6 },
  { id: 'c_phone', name: '通讯', icon: '📱', color: '#56C0E0', order: 7 },
  { id: 'c_medical', name: '医疗', icon: '💊', color: '#F5748B', order: 8 },
  { id: 'c_study', name: '学习', icon: '📚', color: '#6C8CF5', order: 9 },
  { id: 'c_gift', name: '人情', icon: '🎁', color: '#E8756B', order: 10 },
  { id: 'c_pet', name: '宠物', icon: '🐱', color: '#D9965B', order: 11 },
  { id: 'c_travel', name: '旅行', icon: '✈️', color: '#48B0D8', order: 12 },
  { id: 'c_beauty', name: '美容', icon: '💄', color: '#EE7FC0', order: 13 },
  { id: 'c_sport', name: '运动', icon: '🏀', color: '#7FC24B', order: 14 },
  { id: 'c_other_e', name: '其他', icon: '📦', color: '#9A938C', order: 99 },
]

export const INCOME_CATEGORIES: Omit<Category, 'type'>[] = [
  { id: 'c_salary', name: '工资', icon: '💰', color: '#E8A33D', order: 1 },
  { id: 'c_bonus', name: '奖金', icon: '🎉', color: '#F2B84B', order: 2 },
  { id: 'c_invest', name: '理财', icon: '📈', color: '#4FC3A1', order: 3 },
  { id: 'c_parttime', name: '兼职', icon: '💼', color: '#5B9BFF', order: 4 },
  { id: 'c_redpacket', name: '红包', icon: '🧧', color: '#E8756B', order: 5 },
  { id: 'c_reimburse', name: '报销', icon: '🧾', color: '#8B7CF6', order: 6 },
  { id: 'c_other_i', name: '其他', icon: '📦', color: '#9A938C', order: 99 },
]

export function seedCategories(): Category[] {
  return [
    ...EXPENSE_CATEGORIES.map((c) => ({ ...c, type: 'expense' as const })),
    ...INCOME_CATEGORIES.map((c) => ({ ...c, type: 'income' as const })),
  ]
}

export function seedAccounts(): Account[] {
  return [
    { id: 'a_wechat', name: '微信', kind: 'ewallet', icon: '💬', color: '#3EB575', initialBalance: 0, order: 1 },
    { id: 'a_alipay', name: '支付宝', kind: 'ewallet', icon: '🅰️', color: '#2E8BEF', initialBalance: 0, order: 2 },
    { id: 'a_bank', name: '储蓄卡', kind: 'bank', icon: '🏦', color: '#D9A441', initialBalance: 0, order: 3 },
    { id: 'a_credit', name: '信用卡', kind: 'credit', icon: '💳', color: '#B06BD6', initialBalance: 0, order: 4 },
    { id: 'a_cash', name: '现金', kind: 'cash', icon: '💵', color: '#6FBF73', initialBalance: 0, order: 5 },
  ]
}
