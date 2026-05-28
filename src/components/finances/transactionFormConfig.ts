/** Общие категории и хелперы для форм дохода/расхода (добавление и редактирование). */

export const INCOME_CATEGORIES = [
  { value: 'commission', label: 'Комиссия за сделку' },
  { value: 'mortgage_service_fee', label: 'Ипотечная услуга' },
  { value: 'bonus', label: 'Бонус' },
  { value: 'other_income', label: 'Прочий доход' },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: 'premium', label: 'Премия сотруднику' },
  { value: 'salary', label: 'Зарплата сотруднику' },
  { value: 'rent', label: 'Аренда офиса' },
  { value: 'marketing', label: 'Маркетинг' },
  { value: 'utilities', label: 'Коммунальные услуги' },
  { value: 'subscription', label: 'Подписки/Сервисы' },
  { value: 'taxes', label: 'Налоги' },
  { value: 'other_expense', label: 'Прочий расход' },
] as const;

export const MONTH_OPTIONS = [
  { v: '1', l: 'Январь' }, { v: '2', l: 'Февраль' }, { v: '3', l: 'Март' }, { v: '4', l: 'Апрель' },
  { v: '5', l: 'Май' }, { v: '6', l: 'Июнь' }, { v: '7', l: 'Июль' }, { v: '8', l: 'Август' },
  { v: '9', l: 'Сентябрь' }, { v: '10', l: 'Октябрь' }, { v: '11', l: 'Ноябрь' }, { v: '12', l: 'Декабрь' },
];

export function needsKpiCascade(type: 'income' | 'expense', category: string): boolean {
  return (
    category === 'premium' ||
    category === 'salary' ||
    (type === 'income' && (category === 'commission' || category === 'bonus'))
  );
}

export const CATEGORY_LABELS: Record<string, string> = {
  commission: 'Комиссия за сделку',
  deal_commission: 'Комиссия по сделке',
  deal_deposit: 'Задаток по сделке',
  mortgage_service_fee: 'Ипотечная услуга',
  bonus: 'Бонус',
  premium: 'Премия сотруднику',
  salary: 'Зарплата сотруднику',
  other_income: 'Прочий доход',
  rent: 'Аренда офиса',
  marketing: 'Маркетинг',
  utilities: 'Коммунальные',
  subscription: 'Подписки',
  taxes: 'Налоги',
  other_expense: 'Прочий расход',
};
