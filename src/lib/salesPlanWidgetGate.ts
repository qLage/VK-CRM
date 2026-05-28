/**
 * Кто видит классический виджет «План продаж» (UnifiedPlanWidget с модалкой).
 * Остальные — упрощённый read-only виджет по метрикам планирования.
 */
export function shouldUseLegacySalesPlanWidget(params: {
  accessLevel: number;
  appRole: string | null | undefined;
  positionName: string | null | undefined;
}): boolean {
  const access = Number(params.accessLevel) || 0;
  const role = String(params.appRole || '').toLowerCase();
  const pos = String(params.positionName || '').toLowerCase();

  const isCommercialDirector =
    role === 'commercial' ||
    (pos.includes('коммерческ') && pos.includes('директор'));

  const isAdministrator = role === 'admin' || access >= 100;

  const isGeneralDirectorTier = access >= 90 && !isCommercialDirector;

  return Boolean(isCommercialDirector || isAdministrator || isGeneralDirectorTier);
}
