/**
 * Личный KPI: пороги выручки (₽) ↔ ставка % (та же шкала, что на «Мотивации & KPI»).
 * Совпадает с `KPI_TIERS` в RealtorKpiCalculator — используется для риелторов и руководителей с личным KPI.
 */
export const REALTOR_KPI_TIERS: ReadonlyArray<{ percent: number; thresholdRub: number }> = [
  { percent: 40, thresholdRub: 0 },
  { percent: 45, thresholdRub: 700_000 },
  { percent: 50, thresholdRub: 900_000 },
  { percent: 55, thresholdRub: 1_200_000 },
  { percent: 60, thresholdRub: 1_550_000 },
];

/** Индекс ступени по текущему KPI % (как на дашборде «Мотивация & KPI»). */
export function realtorTierIndexByKpiPercent(kpi: number): number {
  const rounded = Math.round(Number(kpi) || 0);
  const exact = REALTOR_KPI_TIERS.findIndex((t) => t.percent === rounded);
  if (exact >= 0) return exact;
  let best = 0;
  for (let i = 0; i < REALTOR_KPI_TIERS.length; i++) {
    if (REALTOR_KPI_TIERS[i].percent <= rounded) best = i;
  }
  return best;
}

/** Следующая ступень по личному KPI (та же логика, что nextThreshold в /kpi/my-stats для риелтора). */
export function getNextRealtorTierFromKpi(
  kpi: number,
): { nextPercent: number; nextThresholdRub: number } | null {
  const idx = realtorTierIndexByKpiPercent(kpi);
  if (idx < 0 || idx >= REALTOR_KPI_TIERS.length - 1) return null;
  const next = REALTOR_KPI_TIERS[idx + 1];
  return { nextPercent: next.percent, nextThresholdRub: next.thresholdRub };
}

/** Роли, для которых в аналитике «до цели» считаем ₽ и % по той же шкале, что личный KPI на дашборде (не управленческий % из kpi_rules). */
const ROLES_WITH_PERSONAL_KPI_LADDER = new Set([
  'realtor',
  'sales_manager',
  'head_sales',
  'commercial',
]);

export function roleUsesPersonalKpiRevenueLadder(role: string | undefined): boolean {
  return ROLES_WITH_PERSONAL_KPI_LADDER.has(String(role || '').toLowerCase());
}
