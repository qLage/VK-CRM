/** Распределение стоимости ипотечной услуги: 5 000 агенту, остаток пополам брокер / агентство. */
const FIXED_AGENT_FEE = 5000;

export function computeMortgageSplits(serviceCost: number): {
    agent_fee: number;
    broker_share: number;
    agency_share: number;
} {
    const svc = Math.max(0, Number(serviceCost) || 0);
    if (svc <= 0) {
        return { agent_fee: 0, broker_share: 0, agency_share: 0 };
    }
    const remainder = Math.max(0, svc - FIXED_AGENT_FEE);
    const agent_fee = remainder > 0 ? FIXED_AGENT_FEE : svc;
    const half = remainder / 2;
    return {
        agent_fee: Math.round(agent_fee * 100) / 100,
        broker_share: Math.round(half * 100) / 100,
        agency_share: Math.round(half * 100) / 100,
    };
}
