import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useEmployeesData, useApprovedData, useSharedData } from './useSharedData';
import {
  subDays, startOfMonth, format, subMonths, endOfMonth,
  isWithinInterval, startOfQuarter, endOfQuarter, startOfYear, endOfYear, endOfDay,
  subQuarters, subYears,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  getNextRealtorTierFromKpi,
  REALTOR_KPI_TIERS,
  realtorTierIndexByKpiPercent,
  roleUsesPersonalKpiRevenueLadder,
} from '@/constants/realtorKpiTiers';

export type PeriodType = 'month' | 'quarter' | 'year' | 'all';

// --- Interfaces ---

interface Employee {
  id: string;
  full_name: string;
  avatar_url?: string;
  position_id?: string;
  role?: string;
  branch_id?: string;
  team_id?: string;
  personal_kpi_current?: number;
  management_kpi_current?: number;
  position?: {
    id: string;
    name: string;
  };
}

interface AnalyticsItem {
  type: string;
  report_type?: string;
  created_at: string;
  created_by?: string;
  user_id?: string;
  author_id?: string;
  branch_id?: string;
  author_branch_id?: string;
  data?: any;
  content?: any;
  status: string;
}

interface LeaderboardEntry {
  userId: string;
  rating: number;
  planCompletion: number;
  revenue: number;
  targetRevenue?: number;
  kpiRate: number;
}

interface AllocationEntry {
  user_id: string;
  target_revenue: number;
  target_deals: number;
  target_deposits: number;
  target_objects: number;
  target_meetings: number;
}

export interface KPIMetrics {
  totalRevenue: number;
  currentPercent: number;
  currentThreshold: number;
  nextThreshold: number | null;
  estimatedIncome: number;
  planCompletion?: number;
}

export interface KPIData {
  type: string;
  displayName: string;
  role: string;
  metrics: KPIMetrics;
  planCompletion?: number;
}

export interface DualKPIResponse {
  hasDualKpi: boolean;
  kpis: KPIData[];
}

export interface PerformanceStats {
  deals: number;
  deposits: number;
  objects: number;
  meetings: number;
}

export interface DailyStat extends PerformanceStats {
  date: string;
}

export interface EmployeePerformanceEntry extends PerformanceStats {
  id: string;
  name: string;
  avatar_url?: string;
  points: number;
  rating: number;
  kpiRate: number;
  planPercent: number;
  revenue: number;
  position_id?: string;
  role?: string;
  targetMeetings: number;
  prevRating?: number | null;
  prevKpiRate?: number | null;
  nextThreshold?: number;
  revenueGap?: number;
  /** Следующий личный KPI % и порог ₽ — как «Мотивация & KPI» для риелторов и руководителей (МОП/РОП/коммерческий) */
  nextKpiPercent?: number;
  position?: any;
  /** На верхней ступени KPI по правилам (для колонки «До новой цели») */
  kpiAtMaxTier?: boolean;
}

/**
 * Передаём границы периода в API как те же календарные дни в UTC.
 * Иначе startOfQuarter (1 янв. локально) через toISOString() уезжает в 31 дек. UTC,
 * и /kpi/leaderboard считает year/month не тем кварталом → KPI прошлого периода = 0%.
 */
function localRangeToUtcIso(start: Date, end: Date): { start: string; end: string } {
  const s = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0));
  const e = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999));
  return { start: s.toISOString(), end: e.toISOString() };
}

// --- Hook Implementation ---

export function useAnalytics() {
  const [branchId, setBranchId] = useState<string>('all');
  const [teamId, setTeamId] = useState<string>('all');
  const [period, setPeriod] = useState<PeriodType>('quarter');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const { startRange, endRange, startPrev, endPrev } = useMemo(() => {
    const baseDate = selectedDate;
    let sR, eR, sP, eP;

    if (period === 'month') {
      sR = startOfMonth(baseDate);
      eR = endOfMonth(baseDate);
      sP = startOfMonth(subMonths(baseDate, 1));
      eP = endOfMonth(subMonths(baseDate, 1));
    } else if (period === 'quarter') {
      sR = startOfQuarter(baseDate);
      eR = endOfQuarter(baseDate);
      const prevQ = subQuarters(baseDate, 1);
      sP = startOfQuarter(prevQ);
      eP = endOfQuarter(prevQ);
    } else if (period === 'year') {
      sR = startOfYear(baseDate);
      eR = endOfYear(baseDate);
      const prevY = subYears(baseDate, 1);
      sP = startOfYear(prevY);
      eP = endOfYear(prevY);
    } else {
      sR = startOfMonth(baseDate);
      eR = endOfMonth(baseDate);
      sP = startOfMonth(subMonths(baseDate, 1));
      eP = endOfMonth(subMonths(baseDate, 1));
    }

    return { startRange: sR, endRange: eR, startPrev: sP, endPrev: eP };
  }, [selectedDate, period]);

  const { data: employees = [] } = useEmployeesData() as { data: Employee[] };
  const { data: allData } = useApprovedData(startRange, endRange) as { data: AnalyticsItem[] };
  const { teams } = useSharedData();

  const calculateStats = React.useCallback((items: AnalyticsItem[]): PerformanceStats => {
    const deals = items.filter((r: any) => r.type === 'deal' || r.type === 'sale').length;
    const deposits = items.filter((r: any) => r.type === 'deposit' || r.type === 'prepayment').length;
    const objects = items.filter((r: any) => r.type === 'listing' || r.type === 'take' || r.type === 'object').length;

    let meetings = 0;
    items.forEach((r: any) => {
      if (r.type === 'meeting' || r.type === 'meeting_office') {
        meetings++;
      } else if (r.report_type === 'daily' || r.type === 'daily') {
        const content = (r.data || r.content) || {};
        meetings += (Number(content.meetings_fact) || 0);
      }
    });

    return { deals, deposits, objects, meetings };
  }, []);

  const EXCLUDED_POSITION_IDS = ['pos-director', 'pos-admin', 'pos-comm'];
  const EXCLUDED_ROLES = ['admin', 'director', 'commercial'];

  const isUserExcluded = React.useCallback((userId: string | undefined): boolean => {
    if (!employees || !userId) return false;
    const employee = (employees as any).find((e: Employee) => e.id === userId);
    if (!employee) return false;
    const posId = (employee.position_id || employee.position?.id || '').toLowerCase();
    const role = (employee.role || '').toLowerCase();
    return EXCLUDED_POSITION_IDS.includes(posId) || EXCLUDED_ROLES.includes(role);
  }, [employees]);

  const getAuthorId = React.useCallback((r: AnalyticsItem): string | undefined => 
    r.created_by || r.user_id || r.author_id || r.data?.author_id, []);

  const dailyStats = useMemo<DailyStat[]>(() => {
    if (!allData) return [];

    const allDataArray = Array.isArray(allData) ? allData : [];
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), i);
      return format(d, 'yyyy-MM-dd');
    }).reverse();

    return last7Days.map(date => {
      const dayItems = allDataArray.filter((r) => {
        const itemDate = new Date(r.data?.date || r.created_at);
        const rDate = format(itemDate, 'yyyy-MM-dd');
        return rDate === date && (branchId === 'all' || (r.branch_id || r.author_branch_id) === branchId) && !isUserExcluded(getAuthorId(r));
      });
      return {
        date,
        ...calculateStats(dayItems)
      };
    });
  }, [allData, branchId, employees, isUserExcluded, getAuthorId, calculateStats]);

  const { data: leaderboardData } = useQuery<LeaderboardEntry[]>({
    queryKey: ['analytics-leaderboard-merge', branchId, teamId, period, selectedDate, 'utc-bounds'],
    queryFn: async () => {
      const { start, end } = localRangeToUtcIso(startRange, endRange);
      let url = `/kpi/leaderboard?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
      if (branchId !== 'all') url += `&branch=${branchId}`;
      if (teamId !== 'all') url += `&team=${teamId}`;

      const { data } = await localAPI.request(url);
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data)) return data;
      return [];
    },
    staleTime: 180000,
  });

  const { data: prevLeaderboardData } = useQuery<LeaderboardEntry[]>({
    queryKey: ['analytics-leaderboard-prev', branchId, teamId, period, selectedDate, 'utc-bounds'],
    queryFn: async () => {
      const { start, end } = localRangeToUtcIso(startPrev, endPrev);
      let url = `/kpi/leaderboard?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
      if (branchId !== 'all') url += `&branch=${branchId}`;
      if (teamId !== 'all') url += `&team=${teamId}`;

      const { data } = await localAPI.request(url);
      return Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    },
    staleTime: 180000,
  });

  const { data: realtorRules } = useQuery({ queryKey: ['kpi-rules-realtor'], queryFn: () => localAPI.getKPIRules('realtor'), staleTime: 600000 });
  const { data: mopRules } = useQuery({ queryKey: ['kpi-rules-mop'], queryFn: () => localAPI.getKPIRules('sales_manager'), staleTime: 600000 });
  const { data: ropRules } = useQuery({ queryKey: ['kpi-rules-rop'], queryFn: () => localAPI.getKPIRules('head_sales'), staleTime: 600000 });

  const { data: allocationsData } = useQuery<{ employees: AllocationEntry[] }>({
    queryKey: ['analytics-allocations', branchId, period, selectedDate],
    queryFn: async () => {
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth() + 1;
      const quarter = Math.ceil(month / 3);

      let url = `/plans/employee-allocations?year=${year}&quarter=${quarter}`;
      if (branchId !== 'all') url += `&branch_id=${branchId}`;

      const { data } = await localAPI.request(url);
      return data;
    },
    staleTime: 180000,
  });

  const employeePerformance = useMemo<EmployeePerformanceEntry[]>(() => {
    if (!allData || !employees) return [];

    const allDataArray = Array.isArray(allData) ? allData : [];
    const employeesArray = Array.isArray(employees) ? (employees as any) : [];
    const allocations = allocationsData?.employees || [];

    const pointsMap: Record<string, number> = {
      deposit: 10, deal: 50, object: 5, showing: 5,
      sale: 30, purchase: 30, meeting: 3, booking: 15,
      prepayment: 10, take: 5, listing: 5
    };

    let filteredEmployees = employeesArray;
    
    // Proper position filtering using centralized check
    filteredEmployees = filteredEmployees.filter((e: Employee) => !isUserExcluded(e.id));

    if (branchId !== 'all') {
      filteredEmployees = filteredEmployees.filter((e: Employee) => e.branch_id === branchId);
    }
    if (teamId !== 'all') {
      filteredEmployees = filteredEmployees.filter((e: Employee) => e.team_id === teamId);
    }

    const divider = period === 'month' ? 3 : 1;

    const pickRules = (bundle: unknown): any[] => {
      if (!bundle || typeof bundle !== 'object') return [];
      const b = bundle as { data?: { rules?: unknown[] }; rules?: unknown[] };
      const fromInner = b.data?.rules;
      if (Array.isArray(fromInner)) return fromInner;
      if (Array.isArray(b.rules)) return b.rules;
      return [];
    };

    const rulesByRole: Record<string, any[]> = {
      realtor: pickRules(realtorRules),
      sales_manager: pickRules(mopRules),
      head_sales: pickRules(ropRules),
      commercial: pickRules(ropRules),
      director: pickRules(ropRules),
    };

    return filteredEmployees.map((employee: Employee) => {
      const userItems = allDataArray.filter((r) => {
        const isOwner = r.created_by === employee.id || r.user_id === employee.id;
        if (!isOwner) return false;
        
        const itemDate = new Date(r.data?.date || r.created_at);
        return isWithinInterval(itemDate, { start: startRange, end: endRange });
      });
      const stats = calculateStats(userItems);
      const points = userItems.reduce((sum: number, r) => sum + (pointsMap[r.type] || 0), 0) + (stats.meetings * 3);

      const lbMatch = (leaderboardData || []).find((lb) => lb.userId === employee.id);
      const prevLbMatch = (prevLeaderboardData || []).find((lb) => lb.userId === employee.id);
      const allocMatch = allocations.find((a) => a.user_id === employee.id);

      // /employees API doesn't join user_roles, so employee.role may be undefined.
      // Determine role from position_name which IS available from the query.
      const posName = (employee.position?.name || '').toLowerCase();
      let role = (employee.role || '').toLowerCase();
      if (!role || !rulesByRole[role]) {
        if (posName.includes('риелтор') || posName.includes('риэлтор') || posName.includes('realtor')) {
          role = 'realtor';
        } else if (posName.includes('моп') || posName.includes('менеджер по продажам') || posName.includes('sales_manager')) {
          role = 'sales_manager';
        } else if (posName.includes('роп') || posName.includes('руководитель отдела') || posName.includes('head_sales')) {
          role = 'head_sales';
        } else if (posName.includes('коммерческий') || posName.includes('commercial')) {
          role = 'commercial';
        } else if (posName.includes('директор') || posName.includes('director')) {
          role = 'director';
        } else {
          role = 'realtor'; // Default to realtor rules
        }
      }
      const rules = rulesByRole[role] || [];
      const revenue = lbMatch?.revenue || 0;
      const planCompletion = lbMatch?.planCompletion || 0;

      // KPI % for the analytics table = value from /kpi/leaderboard for the same date range.
      // Blending previous period + profile inflated "current" KPI and broke tier / "до цели" for everyone.
      const lbKpi = lbMatch?.kpiRate;
      const kpiRateForPeriod =
        lbKpi !== undefined && lbKpi !== null
          ? Number(lbKpi)
          : Number(employee.personal_kpi_current || 0);
      const prevKpiRate =
        prevLbMatch?.kpiRate !== undefined && prevLbMatch?.kpiRate !== null
          ? Number(prevLbMatch.kpiRate)
          : null;

      let nextThreshold: number | undefined;
      let revenueGap: number | undefined;
      let nextKpiPercent: number | undefined;
      let nextRuleIndexComputed = -1;

      const pct = (r: any) => Number(r.percent ?? r.kpi_percent ?? 0);
      const personalKpiSorted = [...pickRules(realtorRules)].sort((a, b) => pct(a) - pct(b));

      if (roleUsesPersonalKpiRevenueLadder(role)) {
        // Как «Мотивация & KPI» (/kpi/my-stats): личный KPI — фиксированная лестница (риелторы, МОП, РОП, коммерческий), не kpi_rules из БД.
        const nextByKpi = getNextRealtorTierFromKpi(kpiRateForPeriod);
        if (nextByKpi) {
          nextKpiPercent = nextByKpi.nextPercent;
          nextThreshold = nextByKpi.nextThresholdRub;
          revenueGap = Math.max(0, nextByKpi.nextThresholdRub - (Number(revenue) || 0));
        }
        const idx = realtorTierIndexByKpiPercent(kpiRateForPeriod);
        nextRuleIndexComputed = nextByKpi ? idx + 1 : REALTOR_KPI_TIERS.length;
      } else {
        const curKpiInt = Math.round(kpiRateForPeriod);
        for (const r of personalKpiSorted) {
          const p = pct(r);
          if (p > curKpiInt) {
            nextKpiPercent = p;
            break;
          }
        }

        if (rules.length > 0) {
          const getThreshold = (r: any) => r.threshold ?? r.min_threshold ?? 0;
          const sortedRules = [...rules].sort((a, b) => getThreshold(a) - getThreshold(b));

          const currentRule = [...sortedRules].reverse().find((r) => planCompletion >= getThreshold(r));
          const currentIndex = currentRule
            ? sortedRules.findIndex((r) => getThreshold(r) === getThreshold(currentRule))
            : -1;

          const nextTierIndex = currentIndex < 0 ? 0 : currentIndex + 1;
          nextRuleIndexComputed = nextTierIndex;
        }
      }

      const atEndMgmtLadder =
        !roleUsesPersonalKpiRevenueLadder(role) &&
        (rules.length === 0 || nextRuleIndexComputed >= rules.length);
      const kpiAtMaxTier =
        roleUsesPersonalKpiRevenueLadder(role)
          ? REALTOR_KPI_TIERS.length > 0 && getNextRealtorTierFromKpi(kpiRateForPeriod) === null
          : personalKpiSorted.length > 0 &&
            nextKpiPercent === undefined &&
            atEndMgmtLadder;

      return {
        id: employee.id,
        name: employee.full_name,
        avatar_url: employee.avatar_url,
        role: employee.role,
        position_name: employee.position?.name,
        position: employee.position,
        revenue,
        targetRevenue: allocMatch ? (allocMatch.target_revenue / divider) : (lbMatch?.targetRevenue || 0),
        deals: stats.deals,
        targetDeals: allocMatch ? Math.ceil(allocMatch.target_deals / divider) : 0,
        deposits: stats.deposits,
        targetDeposits: allocMatch ? Math.ceil(allocMatch.target_deposits / divider) : 0,
        objects: stats.objects,
        targetObjects: allocMatch ? Math.ceil(allocMatch.target_objects / divider) : 0,
        meetings: stats.meetings,
        targetMeetings: allocMatch ? Math.ceil(allocMatch.target_meetings / divider) : 0,
        points,
        rating: lbMatch?.rating || 0,
        kpiRate: kpiRateForPeriod,
        prevRating: prevLbMatch?.rating ?? null,
        prevKpiRate: prevKpiRate,
        revenueGap,
        nextThreshold,
        nextKpiPercent,
        planPercent: planCompletion,
        position_id: employee.position_id,
        kpiAtMaxTier,
      };
    }).sort((a: EmployeePerformanceEntry, b: EmployeePerformanceEntry) => b.rating - a.rating || b.points - a.points);
  }, [allData, employees, branchId, teamId, leaderboardData, prevLeaderboardData, allocationsData, period, realtorRules, mopRules, ropRules, startRange, endRange, isUserExcluded, calculateStats]);

  const kpis = useMemo(() => {
    if (!allData) return { totalDeals: 0, totalDeposits: 0, totalObjects: 0, totalMeetings: 0, trends: {} };

    const allDataArray = Array.isArray(allData) ? allData : [];

    const getDate = (r: AnalyticsItem) => new Date(r.data?.date || r.created_at);

    const filterItems = (items: AnalyticsItem[], start: Date, end: Date) => {
      if (!Array.isArray(items)) return [];
      
      return items.filter((r) => {
        if (!r) return false;
        const itemDate = getDate(r);
        const matchesDate = isWithinInterval(itemDate, { start, end });
        const itemBranchId = r.branch_id || r.author_branch_id;
        const matchesBranch = branchId === 'all' || itemBranchId === branchId;

        if (!matchesDate || !matchesBranch) return false;

        const authorId = getAuthorId(r);
        return !isUserExcluded(authorId);
      });
    };

    const currentItems = filterItems(allDataArray, startRange, endRange);
    const prevItems = filterItems(allDataArray, startPrev, endPrev);
    const current = calculateStats(currentItems);
    const prev = calculateStats(prevItems);

    const formatTrend = (curr: number, p: number) => {
      if (p === 0) return curr > 0 ? '+100%' : '0%';
      const val = ((curr - p) / p) * 100;
      return `${val > 0 ? '+' : ''}${val.toFixed(0)}%`;
    };

    return {
      totalDeals: current.deals,
      totalDeposits: current.deposits,
      totalObjects: current.objects,
      totalMeetings: current.meetings,
      trends: {
        deals: formatTrend(current.deals, prev.deals),
        deposits: formatTrend(current.deposits, prev.deposits),
        objects: formatTrend(current.objects, prev.objects),
        meetings: formatTrend(current.meetings, prev.meetings),
      }
    };
  }, [allData, branchId, period, selectedDate, employees, startRange, endRange, startPrev, endPrev, isUserExcluded, calculateStats]);

  const { data: aggregatedTargets } = useQuery({
    queryKey: ['analytics-targets', branchId, period, selectedDate],
    queryFn: async () => {
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth() + 1;
      const quarter = Math.ceil(month / 3);

      let url = `/plans?year=${year}&quarter=${quarter}`;
      if (branchId && branchId !== 'all') url += `&branch_id=${branchId}`;

      const { data } = await localAPI.request(url);
      let plan: any = null;
      if (data) {
        if (data.plans && Array.isArray(data.plans)) plan = data.plans[0];
        else if (data.data && Array.isArray(data.data)) plan = data.data[0];
        else if (Array.isArray(data)) plan = data[0];
        else if (data.id || data.plan) plan = data.plan || data;
      }

      if (!plan) {
        return { target_deals: 0, target_deposits: 0, target_objects: 0, target_meetings: 0, target_revenue: 0 };
      }

      const div = period === 'month' ? 3 : 1;

      return {
        target_deals: Math.round((plan.target_deals || 0) / div),
        target_deposits: Math.round((plan.target_deposits || 0) / div),
        target_objects: Math.round((plan.target_objects || 0) / div),
        target_meetings: Math.round((plan.target_meetings || 0) / div),
        target_revenue: Math.round((plan.target_revenue || 0) / div),
      };
    },
    staleTime: 180000,
  });

  // Fetch Quarterly KPI Data (Current & Previous)
  const { data: currentQuarterKPI } = useQuery<DualKPIResponse>({
    queryKey: ['analytics-kpi-current', selectedDate],
    queryFn: async () => {
      const { data } = await localAPI.getDualKPIStats('quarter');
      return data;
    },
    staleTime: 300000,
  });

  const { data: prevQuarterKPI } = useQuery<DualKPIResponse>({
    queryKey: ['analytics-kpi-prev', selectedDate, 'utc-bounds'],
    queryFn: async () => {
      const prevQ = subQuarters(selectedDate, 1);
      const { start, end } = localRangeToUtcIso(startOfQuarter(prevQ), endOfQuarter(prevQ));
      const { data } = await localAPI.request(
        `/kpi/my-dual-stats?period=quarter&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      );
      return data;
    },
    staleTime: 300000,
  });

  return {
    dailyStats,
    employeePerformance,
    kpis,
    aggregatedTargets,
    currentQuarterKPI,
    prevQuarterKPI,
    isLoading: !allData,
    branchId,
    setBranchId: (id: string) => {
      setBranchId(id);
      setTeamId('all');
    },
    teamId,
    setTeamId,
    teams: useMemo(() => {
      if (branchId === 'all') return teams;
      return teams.filter((t: any) => t.branch_id === branchId);
    }, [teams, branchId]),
    period,
    setPeriod,
    selectedDate,
    setSelectedDate,
    currentPeriodLabel: period === 'month' 
      ? format(selectedDate, 'LLLL yyyy', { locale: ru }) 
      : `${Math.ceil((selectedDate.getMonth() + 1) / 3)} Квартал ${selectedDate.getFullYear()}`,
    prevPeriodLabel: period === 'month'
      ? format(subMonths(selectedDate, 1), 'LLLL yyyy', { locale: ru })
      : (() => {
          const pd = subQuarters(selectedDate, 1);
          return `${Math.ceil((pd.getMonth() + 1) / 3)} Квартал ${pd.getFullYear()}`;
        })(),
    performance: employeePerformance,
  };
}
