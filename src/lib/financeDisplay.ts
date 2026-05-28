/** Убирает служебный суффикс/префикс выплат оклада для отображения в UI. Полный текст остаётся в БД. */
export function formatExpenseDescriptionForUi(raw?: string | null): string {
  if (raw == null || raw === '') return '—';
  let s = String(raw).trim();
  s = s.replace(/^\[payroll:\d{4}-\d{2}\|[^\]]+\]\s*/i, '');
  s = s.replace(/\s*\[payroll:\d{4}-\d{2}\|[^\]]+\]\s*$/i, '').trim();
  return s.length > 0 ? s : '—';
}
