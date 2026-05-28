/** Расчёт выручки АН по тем же правилам, что DealTableRow.calculateFormulas / форма сделки. */
export function dealCompanyRevenueFromCommissions(
  commissionSeller: number,
  commissionBuyer: number,
  mortgageDeduction: number,
  agentPercentSeller: number,
  agentPercentBuyer: number,
  ropPercent: number,
  mopPercent: number
): number {
  const deduction = Number(mortgageDeduction) || 0;
  const seller = Number(commissionSeller) || 0;
  const buyer = Number(commissionBuyer) || 0;
  const commissionSellerAdjusted = seller - deduction;
  const commissionTotal = commissionSellerAdjusted + buyer;
  const agentIncome =
    (commissionSellerAdjusted * (Number(agentPercentSeller) || 0)) / 100 +
    (buyer * (Number(agentPercentBuyer) || 0)) / 100;
  const ropPayout = (commissionTotal * (Number(ropPercent) || 0)) / 100;
  const mopRevenue = (commissionTotal * (Number(mopPercent) || 0)) / 100;
  return commissionTotal - agentIncome - mopRevenue - ropPayout;
}

export function dealCompanyRevenuePlan(deal: Record<string, unknown>): number {
  return dealCompanyRevenueFromCommissions(
    parseFloat(String(deal.commission_seller_plan ?? 0)) || 0,
    parseFloat(String(deal.commission_buyer_plan ?? 0)) || 0,
    parseFloat(String(deal.mortgage_deduction ?? 0)) || 0,
    parseFloat(String(deal.agent_percent_seller ?? 0)) || 0,
    parseFloat(String(deal.agent_percent_buyer ?? 0)) || 0,
    parseFloat(String(deal.rop_percent ?? 0)) || 0,
    parseFloat(String(deal.mop_percent ?? 0)) || 0
  );
}

/**
 * Плановая сумма комиссий по сделке (как «план продавец + план покупатель» в таблице):
 * (план продавца − ипотечный вычет) + план покупателя, без долей агента/МОП/РОП.
 */
export function dealCommissionPlanTotal(deal: Record<string, unknown>): number {
  const seller = parseFloat(String(deal.commission_seller_plan ?? 0)) || 0;
  const buyer = parseFloat(String(deal.commission_buyer_plan ?? 0)) || 0;
  const ded = parseFloat(String(deal.mortgage_deduction ?? 0)) || 0;
  const adjSeller = Math.max(0, seller - ded);
  return adjSeller + buyer;
}

/**
 * Фактическая сумма комиссии (как commission_total_fact в БД):
 * (факт продавца − ипотечный вычет) + факт покупателя.
 */
export function dealCommissionFactTotal(deal: Record<string, unknown>): number {
  const fromCol = parseFloat(String(deal.commission_total_fact ?? ''));
  if (Number.isFinite(fromCol) && fromCol >= 0 && String(deal.commission_total_fact ?? '').trim() !== '') {
    return fromCol;
  }
  const sf = parseFloat(String(deal.commission_seller_fact ?? 0)) || 0;
  const bf = parseFloat(String(deal.commission_buyer_fact ?? 0)) || 0;
  const ded = parseFloat(String(deal.mortgage_deduction ?? 0)) || 0;
  const adjSeller = Math.max(0, sf - ded);
  return adjSeller + bf;
}

/** Дата поступления денег (календарный день) уже наступила или сегодня. */
export function isPaymentDateReached(paymentDateRaw: unknown): boolean {
  if (paymentDateRaw == null || paymentDateRaw === '') return false;
  const d = new Date(String(paymentDateRaw));
  if (Number.isNaN(d.getTime())) return false;
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return d.getTime() <= end.getTime();
}

const APPROVED_STATUSES = new Set(['approved', 'active']);

/**
 * Прогноз по плановым комиссиям (сумма колонок плана в таблице):
 * для всех неотклонённых сделок — плановая комиссия; минус фактическая комиссия
 * по одобренным сделкам, у которых уже наступила дата поступления денег.
 */
export function forecastAgencyRevenueFromDeals(deals: Record<string, unknown>[]): {
  planTotal: number;
  settledTotal: number;
  remaining: number;
} {
  let planTotal = 0;
  let settledTotal = 0;

  for (const d of deals) {
    const status = String(d.status ?? '');
    if (status === 'rejected') continue;

    planTotal += dealCommissionPlanTotal(d);

    if (APPROVED_STATUSES.has(status) && isPaymentDateReached(d.payment_date)) {
      settledTotal += dealCommissionFactTotal(d);
    }
  }

  const remaining = Math.max(0, planTotal - settledTotal);
  return { planTotal, settledTotal, remaining };
}
