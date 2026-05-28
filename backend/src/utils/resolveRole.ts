/**
 * Определяет каноническую роль пользователя на основе access_level и названия должности.
 * Используется как единый источник правды для computedRole в auth.ts и JWT.
 */
export function resolveRoleFromPosition(
  accessLevel: number,
  positionName?: string | null
): 'admin' | 'director' | 'commercial' | 'head_sales' | 'sales_manager' | 'mortgage_broker' | 'realtor' {
  if (accessLevel >= 100) return 'admin';
  if (accessLevel >= 90) return 'director';

  const pn = String(positionName || '').toLowerCase().trim();

  if (pn.includes('коммерческ')) return 'commercial';
  if (pn.includes('роп') || pn.includes('head')) return 'head_sales';
  if (pn.includes('моп') || pn.includes('manager')) return 'sales_manager';
  if (pn.includes('ипот') || pn.includes('mortgage')) return 'mortgage_broker';

  return 'realtor';
}
