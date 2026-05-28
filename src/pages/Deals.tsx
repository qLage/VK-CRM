// Deals Page - Uses unified KPI API (Plan 02-05)
// Statistics match Dashboard exactly (same backend source)
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MainLayout } from '@/components/layout/MainLayout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  Plus, Search, Trash2, ExternalLink, Pencil,
  TrendingUp, DollarSign, BarChart3, Building2, Handshake, User, Users, LineChart,
  CheckCircle2, XCircle, Filter, ChevronRight, LayoutGrid, List, Send
} from 'lucide-react';
import { AddDealRowDialog } from '@/components/Deals/AddDealRowDialog';
import { MetricsPanel } from '@/components/Deals/MetricsPanel';
import { GroupedDealsView } from '@/components/Deals/GroupedDealsView';
import { HierarchyBreadcrumb } from '@/components/Deals/HierarchyBreadcrumb';
import { RoleBasedFilterBar } from '@/components/Deals/RoleBasedFilterBar';
import { MyDealsToggle } from '@/components/Deals/MyDealsToggle';
import { DealsMortgageToggle } from '@/components/Deals/DealsMortgageToggle';
import { BranchFilter } from '@/components/Deals/BranchFilter';
import { DealStatusFilter } from '@/components/Deals/DealStatusFilter';
import { useDrillDownDeals } from '@/hooks/useDrillDownDeals';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useDealForecastQuery } from '@/hooks/useDealForecastQuery';
import { forecastAgencyRevenueFromDeals } from '@/utils/dealForecast';
import { localAPI } from '@/integrations/localAPI';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { canAccessMortgageSection } from '@/lib/canAccessMortgage';
import { formatMoneyTrimTrailingZeros, formatInteger, formatCompactMoney, formatPercent } from '@/utils/formatters';

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

type DealDetailCol = { label: string | readonly [string, string]; cls: string; directorOnly?: boolean };

function dealDetailThCaption(label: string | readonly [string, string]) {
  const lines =
    typeof label === 'string' ? (
      <span className="block max-w-[7rem] whitespace-normal leading-snug [text-wrap:balance]">{label}</span>
    ) : (
      <>
        <span className="block whitespace-nowrap leading-snug">{label[0]}</span>
        <span className="block whitespace-nowrap leading-snug">{label[1]}</span>
      </>
    );

  return <div className="flex flex-col items-center justify-center gap-0.5 text-center">{lines}</div>;
}

/** Вертикальный разделитель колонок; данные и заголовки — по центру. */
const DEAL_TABLE_TD = 'px-2 py-2.5 text-center align-middle border-r border-white/[0.045] last:border-r-0';

const DEAL_TABLE_TH = 'border-r border-white/[0.045] last:border-r-0';

/** Подписи колонок детальной таблицы сделок — не более двух строк (tuple фиксирует перенос). */
const DEAL_DETAIL_THEAD_COLUMNS: DealDetailCol[] = [
  { label: 'Статус', cls: '' },
  { label: 'Объект', cls: '' },
  { label: 'Документ', cls: '' },
  { label: 'Продавец', cls: '' },
  { label: 'Покупатель', cls: '' },
  { label: 'Задаток', cls: '' },
  { label: 'Сделка', cls: '' },
  { label: 'Поступление', cls: '' },
  { label: ['Комиссия', 'план (продавец)'], cls: '' },
  { label: ['Комиссия', 'план (покупатель)'], cls: '' },
  { label: ['Комиссия', 'факт (продавец)'], cls: '' },
  { label: ['Комиссия', 'факт (покупатель)'], cls: '' },
  { label: 'Услуга', cls: '' },
  { label: ['% агента', '(продавец)'], cls: '' },
  { label: ['% агента', '(покупатель)'], cls: '' },
  { label: 'Инфо', cls: '' },
  { label: 'Ипотека', cls: '' },
  { label: 'Сдельщик', cls: '' },
  { label: 'Выдача', cls: '' },
  { label: ['ЗП', 'сотрудника'], cls: 'bg-emerald-500/[0.04]' },
  { label: '% МОП', cls: '' },
  { label: ['Выручка', 'МОП'], cls: '' },
  { label: ['Выручка', 'РОП'], cls: '' },
  { label: ['Выручка', 'АН'], cls: 'bg-primary/[0.04]', directorOnly: true },
  { label: '🔗', cls: '' },
  { label: '⚙', cls: '' },
];

function dealRowYearMonth(deal: Record<string, unknown>): { y: number; m: number } {
  const yRaw = Number(deal?.year);
  const mRaw = Number(deal?.month);
  if (Number.isFinite(yRaw) && yRaw >= 2000 && Number.isFinite(mRaw) && mRaw >= 1 && mRaw <= 12) {
    return { y: yRaw, m: mRaw };
  }
  const raw = deal?.deal_date || deal?.payment_date || deal?.deposit_date;
  if (raw) {
    const d = new Date(String(raw));
    if (!Number.isNaN(d.getTime())) return { y: d.getFullYear(), m: d.getMonth() + 1 };
  }
  return { y: 0, m: 0 };
}

interface BreadcrumbItem {
  label: string;
  level: 'company' | 'branch' | 'team' | 'employee';
  id?: string;
}

export default function Deals() {
  const { user, accessLevel, profile, role } = useAuth();
  const { branches } = useBranches();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Check if user is part of a team
  const hasTeam = !!(profile?.team_id || user?.team_id);
  const hasBranch = !!(profile?.branch_id || user?.branch_id);

  const [filters, setFilters] = useState({
    year: currentYear,
    month: 0, // 0 = all months, not current month
    searchQuery: '',
    dealStatus: 'all' as 'all' | 'pending' | 'approved' | 'rejected',
    minAmount: undefined as number | undefined,
    maxAmount: undefined as number | undefined,
  });

  const [selectedBranch, setSelectedBranch] = useState<string | undefined>();
  const [isMyDealsOnly, setIsMyDealsOnly] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dealToDelete, setDealToDelete] = useState<string | null>(null);
  const [editingDeal, setEditingDeal] = useState<any>(null);
  const [rejectionDialogOpen, setRejectionDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [dealToReject, setDealToReject] = useState<string | null>(null);

  // МОП/РОП start with team view by default if they have a team, otherwise personal
  const getInitialViewMode = (): 'personal' | 'team' | 'branch' => {
    if (accessLevel >= 90) return 'branch';
    if (accessLevel >= 50 && hasTeam) return 'team';
    return 'personal';
  };

  const [viewMode, setViewMode] = useState<'personal' | 'team' | 'branch'>(getInitialViewMode());

  const getInitialLevel = (): 'company' | 'branch' | 'team' | 'employee' => {
    const initialMode = getInitialViewMode();
    console.log('🔍 getInitialLevel:', { initialMode, accessLevel, isDirector: accessLevel >= 90 });
    if (initialMode === 'personal') return 'employee';
    if (initialMode === 'branch') {
      // Directors start at company level to see all branches first
      const level = accessLevel >= 90 ? 'company' : 'branch';
      console.log('🔍 Branch mode level:', level);
      return level;
    }
    if (initialMode === 'team') return 'team';
    return 'employee';
  };

  const getInitialLabel = () => {
    const initialMode = getInitialViewMode();
    if (initialMode === 'personal') return 'Мои сделки';
    if (initialMode === 'branch') {
      // Directors start at company level to see all branches first
      return accessLevel >= 90 ? 'Компания' : 'Филиал';
    }
    if (initialMode === 'team') return 'Команда';
    return 'Мои сделки';
  };

  const initialLevel = getInitialLevel();
  const initialLabel = getInitialLabel();
  console.log('🔍 Initial navigation:', { initialLevel, initialLabel });

  const [navigationPath, setNavigationPath] = useState<BreadcrumbItem[]>([
    { label: initialLabel, level: initialLevel }
  ]);

  // Reset navigation when view mode changes
  const handleViewModeChange = (mode: 'personal' | 'team' | 'branch') => {
    setViewMode(mode);
    let newLevel: 'company' | 'branch' | 'team' | 'employee';
    let newLabel: string;

    if (mode === 'personal') {
      // Personal mode - show individual employee deals
      newLevel = 'employee';
      newLabel = 'Мои сделки';
    } else if (mode === 'branch') {
      // Branch mode - directors start at company level to see all branches first
      newLevel = accessLevel >= 90 ? 'company' : 'branch';
      newLabel = accessLevel >= 90 ? 'Компания' : 'Филиал';
    } else {
      // Team mode - always show team level (grouped employees)
      newLevel = 'team';
      newLabel = 'Команда';
    }

    setNavigationPath([{ label: newLabel, level: newLevel }]);
  };

  const currentLevel = navigationPath[navigationPath.length - 1]?.level || getInitialLevel();
  console.log('🔍 Current navigation state:', { currentLevel, navigationPath });

  const currentFilters = useMemo(() => {
    const employeePath = navigationPath.find(p => p.level === 'employee');
    const employeeId = employeePath?.id;
    const isUuid = employeeId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId);

    return {
      ...filters,
      month: filters.month === 0 ? null : filters.month,
      branch_id: selectedBranch || navigationPath.find(p => p.level === 'branch')?.id,
      team_id: navigationPath.find(p => p.level === 'team')?.id,
      agent_id: isUuid ? employeeId : undefined,
      agent_name: !isUuid ? employeeId : undefined,
      dealStatus: filters.dealStatus,
      minAmount: filters.minAmount,
      maxAmount: filters.maxAmount,
      isMyDealsOnly,
    };
  }, [filters, navigationPath, selectedBranch, isMyDealsOnly]);

  const { groups, deals, totals, isLoading, refetch } = useDrillDownDeals(currentLevel, currentFilters);

  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (dealId: string) => {
      const { error } = await localAPI.request(`/deal-table/${dealId}`, { method: 'DELETE' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drill-down-grouped'] });
      queryClient.invalidateQueries({ queryKey: ['drill-down-detailed'] });
      queryClient.invalidateQueries({ queryKey: ['drill-down-totals'] });
      // Comprehensive invalidation for all deal-related queries
      queryClient.invalidateQueries({ queryKey: ['role-based-deals'] });
      queryClient.invalidateQueries({ queryKey: ['role-based-totals'] });
      queryClient.invalidateQueries({ queryKey: ['grouped-deals'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['kpi'] });
      queryClient.invalidateQueries({ queryKey: ['employee-deal-stats'] });
      queryClient.invalidateQueries({ queryKey: ['deal-forecast-rows'] });
      toast.success('Сделка удалена');
      setDeleteDialogOpen(false);
      setDealToDelete(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Ошибка при удалении');
    }
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: string; reason?: string }) => {
      const { error } = await localAPI.request(`/deal-table/${id}/status`, {
        method: 'PATCH',
        body: { status, reason }
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      // Optimistically update all drill-down-detailed caches immediately
      queryClient.setQueriesData(
        { queryKey: ['drill-down-detailed'] },
        (oldData: any) => {
          if (!oldData?.rows) return oldData;
          return {
            ...oldData,
            rows: oldData.rows.map((d: any) =>
              d.id === variables.id
                ? { ...d, status: variables.status, rejection_reason: variables.reason }
                : d
            )
          };
        }
      );
      queryClient.invalidateQueries({ queryKey: ['drill-down-detailed'] });
      queryClient.invalidateQueries({ queryKey: ['drill-down-grouped'] });
      queryClient.invalidateQueries({ queryKey: ['drill-down-totals'] });
      queryClient.invalidateQueries({ queryKey: ['kpi'] });
      queryClient.invalidateQueries({ queryKey: ['deal-forecast-rows'] });
      toast.success('Статус обновлен');
      setRejectionDialogOpen(false);
      setRejectionReason('');
      setDealToReject(null);
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Ошибка при обновлении статуса');
    }
  });

  const filteredDeals = useMemo(() => {
    if (!filters.searchQuery.trim()) return deals;
    const q = filters.searchQuery.toLowerCase();
    return deals.filter((d: any) =>
      d.agent_name?.toLowerCase().includes(q) || d.rop_name?.toLowerCase().includes(q)
    );
  }, [deals, filters.searchQuery]);

  const showAgencyRevenue = accessLevel >= 90;

  const visibleDealCols = useMemo(
    () => DEAL_DETAIL_THEAD_COLUMNS.filter((c) => !c.directorOnly || showAgencyRevenue),
    [showAgencyRevenue]
  );

  const forecastRowsQuery = useDealForecastQuery(
    currentLevel !== 'employee',
    currentLevel,
    accessLevel,
    currentFilters
  );

  const forecastStats = useMemo(() => {
    const rows =
      currentLevel === 'employee'
        ? (filteredDeals as Record<string, unknown>[])
        : (forecastRowsQuery.data ?? []);
    return forecastAgencyRevenueFromDeals(rows);
  }, [currentLevel, filteredDeals, forecastRowsQuery.data]);

  const forecastLoading = currentLevel !== 'employee' && forecastRowsQuery.isLoading;

  type DealTableItem =
    | { kind: 'group'; label: string; key: string }
    | { kind: 'row'; deal: Record<string, unknown> };

  const groupedDealTable = useMemo(() => {
    const sorted = [...filteredDeals].sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const A = dealRowYearMonth(a);
      const B = dealRowYearMonth(b);
      if (A.y !== B.y) return B.y - A.y;
      if (A.m !== B.m) return B.m - A.m;
      const da = new Date(String(a.deal_date || a.payment_date || 0)).getTime();
      const db = new Date(String(b.deal_date || b.payment_date || 0)).getTime();
      return db - da;
    });
    const out: DealTableItem[] = [];
    let prevKey = '';
    for (const deal of sorted) {
      const { y, m } = dealRowYearMonth(deal);
      const gk = y > 0 && m >= 1 ? `${y}-${String(m).padStart(2, '0')}` : 'unknown';
      if (gk !== prevKey) {
        prevKey = gk;
        const label =
          y > 0 && m >= 1 && m <= 12 ? `${MONTH_NAMES[m - 1]?.toLowerCase() || ''} ${y}`.trim() : 'Без периода';
        out.push({ kind: 'group', label, key: gk });
      }
      out.push({ kind: 'row', deal });
    }
    return out;
  }, [filteredDeals]);

  const filteredGroups = useMemo(() => {
    if (!filters.searchQuery.trim()) return groups;
    const q = filters.searchQuery.toLowerCase();
    return groups.filter((g: any) =>
      g.agent_name?.toLowerCase().includes(q) ||
      g.team_name?.toLowerCase().includes(q) ||
      g.branch_name?.toLowerCase().includes(q)
    );
  }, [groups, filters.searchQuery]);

  const handleDrillDown = (groupId: string, groupName: string, fromLevel: 'team' | 'branch' | 'company') => {
    const nextLevel: 'company' | 'branch' | 'team' | 'employee' =
      fromLevel === 'company' ? 'branch' : fromLevel === 'branch' ? 'team' : 'employee';
    setNavigationPath([...navigationPath, { label: groupName, level: nextLevel, id: groupId }]);
  };

  const handleNavigate = (index: number) => {
    setNavigationPath(navigationPath.slice(0, index + 1));
  };

  const totalDeals = parseInt(totals?.deal_count?.toString() || '0');
  const companyRevenue = parseFloat(totals?.total_company_revenue?.toString() || '0');
  const totalCommission = parseFloat(totals?.total_commission_fact?.toString() || '0');
  const avgCheck = parseFloat(totals?.avg_check?.toString() || '0');

  const bentoCards = useMemo(() => {
    const cards = [
      {
        label: 'Всего сделок',
        value: isLoading ? null : totalDeals.toString(),
        sub: 'шт.',
        icon: Handshake,
        glow: 'bg-primary/10',
        border: 'border-primary/10',
        iconCls: 'text-primary',
        bg: 'group-hover:bg-primary/15',
      },
      {
        label: 'Общая комиссия',
        value: isLoading ? null : formatCompactMoney(totalCommission),
        sub: '',
        icon: DollarSign,
        glow: 'bg-emerald-500/10',
        border: 'border-emerald-500/10',
        iconCls: 'text-emerald-400',
        bg: 'group-hover:bg-emerald-500/15',
      },
      {
        label: 'Средний чек',
        value: isLoading ? null : formatCompactMoney(avgCheck),
        sub: '',
        icon: BarChart3,
        glow: 'bg-violet-500/10',
        border: 'border-violet-500/10',
        iconCls: 'text-violet-400',
        bg: 'group-hover:bg-violet-500/15',
      },
      {
        label: 'Прогноз по сделкам',
        value:
          isLoading || forecastLoading
            ? null
            : formatCompactMoney(forecastStats.remaining),
        sub: 'комиссия по плану минус поступившая',
        icon: LineChart,
        glow: 'bg-cyan-500/10',
        border: 'border-cyan-500/10',
        iconCls: 'text-cyan-400',
        bg: 'group-hover:bg-cyan-500/15',
      },
    ];
    if (showAgencyRevenue) {
      cards.push({
        label: 'Выручка АН',
        value: isLoading ? null : formatCompactMoney(companyRevenue),
        sub: '',
        icon: Building2,
        glow: 'bg-amber-500/10',
        border: 'border-amber-500/10',
        iconCls: 'text-amber-400',
        bg: 'group-hover:bg-amber-500/15',
      });
    }
    return cards;
  }, [
    isLoading,
    forecastLoading,
    totalDeals,
    totalCommission,
    avgCheck,
    forecastStats.remaining,
    companyRevenue,
    showAgencyRevenue,
  ]);

  return (
    <MainLayout>
      <div className="space-y-6 md:space-y-8 lg:space-y-10 animate-fade-in max-w-[1600px] mx-auto pb-16 md:pb-20 pt-4 md:pt-6 lg:pt-8 px-4 sm:px-8">

        {/* ── PREMIUM HEADER ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6 lg:gap-8">
          <div className="space-y-2 md:space-y-3">
            <div className="mb-2">
              <img src="/logo-panel.svg" alt="Logo" className="h-5 md:h-6 w-auto object-contain opacity-40" />
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white uppercase tracking-tighter leading-none">
              СДЕЛКИ
            </h1>
            <p className="text-xs md:text-sm font-black text-white/20 uppercase tracking-[0.3em] flex items-center gap-2">
              <span className="w-8 md:w-10 h-px bg-white/10" />
              {filters.month === 0
                ? `Весь ${filters.year}`
                : `${MONTH_NAMES[filters.month - 1]} ${filters.year}`}{' '}
              · аналитика по сделкам
            </p>
          </div>
          <div className="flex gap-2 md:gap-3 self-start md:self-auto">
            {/* Top button removed to declutter header per user request */}
          </div>
        </div>

        {/* View Mode Toggle - Only for МОП/РОП with team */}
        {accessLevel >= 50 && accessLevel < 90 && hasTeam && (
          <div className="flex gap-2 p-1 bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-lg w-fit">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleViewModeChange('personal')}
              className={cn(
                "gap-2 transition-all",
                viewMode === 'personal'
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              )}
            >
              <User className="h-4 w-4" />
              Мои сделки
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleViewModeChange('team')}
              className={cn(
                "gap-2 transition-all",
                viewMode === 'team'
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              )}
            >
              <Users className="h-4 w-4" />
              Сделки команды
            </Button>
          </div>
        )}

        {/* View Mode Toggle - For Employees with team */}
        {accessLevel < 50 && hasTeam && (
          <div className="flex gap-2 p-1 bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-lg w-fit">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleViewModeChange('personal')}
              className={cn(
                "gap-2 transition-all",
                viewMode === 'personal'
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              )}
            >
              <User className="h-4 w-4" />
              Мои сделки
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleViewModeChange('team')}
              className={cn(
                "gap-2 transition-all",
                viewMode === 'team'
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              )}
            >
              <Users className="h-4 w-4" />
              Моя команда
            </Button>
          </div>
        )}

        {/* ── BENTO STATS ── */}
        <div
          className={cn(
            'grid grid-cols-2 gap-4 md:gap-5',
            bentoCards.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'
          )}
        >
          {bentoCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="relative overflow-hidden rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/40 border border-white/5 p-5 md:p-6 lg:p-7 backdrop-blur-3xl group shadow-2xl"
              >
                <div className={`absolute top-0 right-0 w-24 md:w-32 h-24 md:h-32 ${card.glow} blur-[60px] rounded-full pointer-events-none ${card.bg} transition-all duration-1000`} />
                <div className="relative z-10 space-y-3 md:space-y-4">
                  <div className={`p-2.5 md:p-3 ${card.glow} rounded-xl md:rounded-2xl border ${card.border} w-fit`}>
                    <Icon className={`h-5 w-5 md:h-6 md:w-6 ${card.iconCls}`} />
                  </div>
                  <div>
                    {card.value === null ? (
                      <div className="h-8 md:h-10 w-24 bg-white/10 rounded-lg animate-pulse" />
                    ) : (
                      <h2 className="text-2xl md:text-3xl lg:text-4xl font-black text-white tracking-tighter tabular-nums">
                        {card.value}
                      </h2>
                    )}
                    <p className="text-[9px] md:text-[10px] font-black text-white/20 uppercase tracking-[0.15em] md:tracking-[0.2em] mt-1">
                      <span className="block">{card.label}</span>
                      {card.sub ? (
                        <span className="block text-[8px] font-bold text-white/15 uppercase tracking-wider mt-0.5">
                          {card.sub}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── HEADER ACTIONS ── */}
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between mb-8">
          <div className="flex min-w-0 flex-wrap items-center gap-4 md:flex-nowrap flex-1 max-w-2xl">
            <RoleBasedFilterBar
              accessLevel={accessLevel}
              filters={filters}
              onFiltersChange={setFilters}
              currentYear={currentYear}
              currentLevel={currentLevel}
              mode="header"
            />
            {canAccessMortgageSection(role ?? user?.role, accessLevel) && <DealsMortgageToggle />}
            <Sheet open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
              <SheetTrigger asChild>
                <Button 
                  variant="outline" 
                  className={cn(
                    "h-10 md:h-11 shrink-0 px-4 md:px-6 gap-2 bg-zinc-900/60 border-white/10 text-white hover:bg-white/5 rounded-xl transition-all",
                    (filters.month !== 0 || filters.dealStatus !== 'all' || filters.minAmount || filters.maxAmount) && "border-primary/50 bg-primary/5 text-primary"
                  )}
                >
                  <Filter className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline font-bold uppercase tracking-widest text-[10px] whitespace-nowrap">Фильтры</span>
                  {(filters.month !== 0 || filters.dealStatus !== 'all' || filters.minAmount || filters.maxAmount) && (
                    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white shrink-0">
                      {[filters.month !== 0, filters.dealStatus !== 'all', filters.minAmount, filters.maxAmount].filter(Boolean).length}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-md bg-zinc-950 border-white/5 p-0">
                <div className="p-6 h-full flex flex-col">
                  <SheetHeader className="mb-8">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-xl border border-primary/10">
                        <Filter className="h-4 w-4 text-primary" />
                      </div>
                      <SheetTitle className="text-white font-black uppercase tracking-widest">Фильтры</SheetTitle>
                    </div>
                  </SheetHeader>
                  
                  <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                    <RoleBasedFilterBar
                      accessLevel={accessLevel}
                      filters={filters}
                      onFiltersChange={(newFilters: any) => {
                        setFilters(newFilters);
                        setIsFiltersOpen(false);
                      }}
                      currentYear={currentYear}
                      currentLevel={currentLevel}
                      mode="sidebar"
                    />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setEditingDeal(null);
                setDialogOpen(true);
              }}
              className="h-10 md:h-11 px-6 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 group"
            >
              <Plus className="h-4 w-4 mr-2 group-hover:rotate-90 transition-transform" />
              Создать сделку
            </Button>
          </div>
        </div>

        {/* ── BREADCRUMB ── */}
        {navigationPath.length > 1 && (
          <HierarchyBreadcrumb path={navigationPath} onNavigate={handleNavigate} />
        )}

        {/* ── CONTENT ── */}
        <AnimatePresence mode="wait">
          {currentLevel !== 'employee' ? (
            <motion.div key="grouped" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <GroupedDealsView
                groups={filteredGroups}
                totals={totals}
                level={currentLevel}
                isLoading={isLoading}
                onDrillDown={handleDrillDown}
                showAgencyRevenue={showAgencyRevenue}
              />
            </motion.div>
          ) : (
            <motion.div
              key="table"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 overflow-hidden shadow-2xl"
            >
              {/* Table header bar */}
              <div className="flex items-center justify-between px-5 md:px-6 lg:px-8 py-4 md:py-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-xl border border-primary/10">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs md:text-sm font-black text-white uppercase tracking-wider">Детали сделок</p>
                    <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">
                      {filteredDeals.length} {filteredDeals.length === 1 ? 'запись' : 'записей'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/5 bg-black/20">
                      {visibleDealCols.map(({ label, cls }, colIdx) => (
                        <th
                          key={`deal-col-${colIdx}`}
                          className={`px-2 py-3 text-[9px] font-black text-white/20 uppercase tracking-wider align-middle text-center ${DEAL_TABLE_TH} ${cls}`}
                        >
                          {dealDetailThCaption(label)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={visibleDealCols.length} className="py-20 text-center">
                          <div className="flex items-center justify-center gap-2 text-white/20">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                            <span className="font-black uppercase tracking-wider text-[10px]">Загрузка...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredDeals.length === 0 ? (
                      <tr>
                        <td colSpan={visibleDealCols.length} className="py-20 text-center">
                          <p className="text-xs font-black text-white/10 uppercase tracking-widest">
                            {filters.searchQuery ? 'Ничего не найдено' : 'Нет сделок за выбранный период'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      groupedDealTable.map((item, idx: number) => {
                        if (item.kind === 'group') {
                          return (
                            <tr key={`deal-g-${item.key}-${idx}`} className="border-t border-white/[0.04] bg-white/[0.02]">
                              <td colSpan={visibleDealCols.length} className="px-4 py-2.5">
                                <p className="text-[10px] font-black text-white/35 uppercase tracking-[0.2em]">{item.label}</p>
                              </td>
                            </tr>
                          );
                        }
                        const deal = item.deal as Record<string, any>;
                        return (
                        <motion.tr
                          key={deal.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.015 }}
                          className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors group"
                        >
                          <td className={cn(DEAL_TABLE_TD, 'whitespace-nowrap')}>
                            <div className={cn(
                              "inline-flex flex-col items-center gap-1"
                            )}>
                              <div className={cn(
                                "inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter",
                                deal.status === 'approved' || deal.status === 'active' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                deal.status === 'rejected' ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                                deal.status === 'draft' ? "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20" :
                                "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              )}>
                                {deal.status === 'approved' || deal.status === 'active' ? 'Одобрено' :
                                 deal.status === 'rejected' ? 'Отклонено' :
                                 deal.status === 'draft' ? 'Черновик' : 'Ожидает'}
                              </div>
                              {/* Rejection reason removed from badge area — shown in tooltip only */}
                            </div>
                          </td>
                          <td className={cn(DEAL_TABLE_TD, 'font-bold text-white whitespace-nowrap')} title={deal.property_name}>
                            <div className="mx-auto max-w-[160px] truncate">{deal.property_name}</div>
                          </td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/50 whitespace-nowrap')}>{deal.document_type}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/60 whitespace-nowrap')}>{deal.seller || '—'}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/60 whitespace-nowrap')}>{deal.buyer || '—'}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/50 whitespace-nowrap')}>{deal.deposit_date ? new Date(deal.deposit_date).toLocaleDateString('ru-RU') : '—'}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/50 whitespace-nowrap')}>{deal.deal_date ? new Date(deal.deal_date).toLocaleDateString('ru-RU') : '—'}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/50 whitespace-nowrap')}>{deal.payment_date ? new Date(deal.payment_date).toLocaleDateString('ru-RU') : '—'}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/50 font-mono whitespace-nowrap')}>{formatMoneyTrimTrailingZeros(deal.commission_seller_plan)}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/50 font-mono whitespace-nowrap')}>{formatMoneyTrimTrailingZeros(deal.commission_buyer_plan)}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/70 font-mono whitespace-nowrap')}>{formatMoneyTrimTrailingZeros(deal.commission_seller_fact)}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/70 font-mono whitespace-nowrap')}>{formatMoneyTrimTrailingZeros(deal.commission_buyer_fact)}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/50 whitespace-nowrap')}>{deal.service || '—'}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/50 font-mono whitespace-nowrap')}>{formatPercent(deal.agent_percent_seller)}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/50 font-mono whitespace-nowrap')}>{formatPercent(deal.agent_percent_buyer)}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/40 whitespace-nowrap')} title={deal.information}>
                            <div className="mx-auto max-w-[120px] truncate">{deal.information || '—'}</div>
                          </td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/50 font-mono whitespace-nowrap')}>{formatMoneyTrimTrailingZeros(deal.mortgage_deduction)}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/50 font-mono whitespace-nowrap')}>{formatMoneyTrimTrailingZeros(deal.subcontractor_amount)}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/50 whitespace-nowrap')}>{deal.payout_date ? new Date(deal.payout_date).toLocaleDateString('ru-RU') : '—'}</td>
                          <td className={cn(DEAL_TABLE_TD, 'font-bold font-mono text-emerald-400 bg-emerald-500/[0.04] whitespace-nowrap')}>{formatMoneyTrimTrailingZeros(deal.agent_income)}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/50 font-mono whitespace-nowrap')}>{formatPercent(deal.mop_percent)}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/50 font-mono whitespace-nowrap')}>{formatMoneyTrimTrailingZeros(deal.mop_revenue)}</td>
                          <td className={cn(DEAL_TABLE_TD, 'text-white/50 font-mono whitespace-nowrap')}>{formatMoneyTrimTrailingZeros(deal.rop_payout)}</td>
                          {showAgencyRevenue ? (
                            <td className={cn(DEAL_TABLE_TD, 'font-bold font-mono text-primary bg-primary/[0.04] whitespace-nowrap')}>
                              {formatMoneyTrimTrailingZeros(deal.company_revenue)}
                            </td>
                          ) : null}
                          <td className={cn(DEAL_TABLE_TD, 'whitespace-nowrap')}>
                            <div className="flex justify-center items-center">
                              {deal.document_link ? (
                                <a
                                  href={deal.document_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center p-1.5 rounded-lg text-primary/50 hover:text-primary hover:bg-primary/10 transition-all"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              ) : (
                                <span className="text-white/10">—</span>
                              )}
                            </div>
                          </td>
                          <td className={cn(DEAL_TABLE_TD, 'whitespace-nowrap')}>
                            {(() => {
                              // Сотрудники (accessLevel < 50) видят кнопки только для своих сделок
                              // Руководители (>= 50) видят кнопки для всех сделок
                              const createdBy = deal.created_by;
                              const userId = user?.id;
                              const hasCreatedBy = !!createdBy;

                              // Для новых сделок: проверяем created_by (UUID comparison)
                              const isOwner = createdBy && userId ? createdBy === userId : false;

                              // Fallback: если created_by не совпал, проверяем agent_id (например, сделка создана директором)
                              const isOwnerByAgent = deal.agent_id && userId ? deal.agent_id === userId : false;

                              // Show buttons if: manager OR owner by UUID OR owner by name (for old deals)
                              const canEditDelete = accessLevel >= 50 || isOwner || isOwnerByAgent;

                              if (!canEditDelete) return <span className="text-white/10">—</span>;

                              return (
                                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {(deal.status === 'draft' || deal.status === 'rejected') && (isOwner || isOwnerByAgent || accessLevel >= 50) && (
                                    <button
                                      onClick={() => statusMutation.mutate({ id: deal.id, status: 'pending' })}
                                      disabled={statusMutation.isPending}
                                      className="p-1.5 rounded-lg text-amber-400/60 hover:text-amber-300 hover:bg-amber-500/10 transition-all"
                                      title={deal.status === 'rejected' ? 'Повторно отправить на одобрение' : 'Отправить на одобрение'}
                                    >
                                      <Send className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {deal.status === 'pending' && accessLevel >= 50 && (
                                    <>
                                      <button
                                        onClick={() => statusMutation.mutate({ id: deal.id, status: 'approved' })}
                                        disabled={statusMutation.isPending}
                                        className="p-1.5 rounded-lg text-emerald-400/60 hover:text-emerald-300 hover:bg-emerald-500/10 transition-all"
                                        title="Одобрить"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          setDealToReject(deal.id);
                                          setRejectionDialogOpen(true);
                                        }}
                                        disabled={statusMutation.isPending}
                                        className="p-1.5 rounded-lg text-red-400/60 hover:text-red-300 hover:bg-red-500/10 transition-all"
                                        title="Отклонить"
                                      >
                                        <XCircle className="h-3.5 w-3.5" />
                                      </button>
                                    </>
                                  )}
                                  <button
                                    onClick={() => { setEditingDeal(deal); setDialogOpen(true); }}
                                    className="p-1.5 rounded-lg text-blue-400/60 hover:text-blue-300 hover:bg-blue-500/10 transition-all"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => { setDealToDelete(deal.id); setDeleteDialogOpen(true); }}
                                    className="p-1.5 rounded-lg text-red-400/60 hover:text-red-300 hover:bg-red-500/10 transition-all"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              );
                            })()}
                          </td>
                        </motion.tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Dialogs ── */}
      <AddDealRowDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingDeal(null); }}
        editingDeal={editingDeal}
        onSuccess={() => { setDialogOpen(false); setEditingDeal(null); refetch(); }}
        contextFilters={{
          branch_id: currentFilters.branch_id,
          team_id: currentFilters.team_id,
          agent_id: currentFilters.agent_id,
          agent_name: navigationPath.find(p => p.level === 'employee')?.label,
        }}
      />

      <Dialog open={rejectionDialogOpen} onOpenChange={setRejectionDialogOpen}>
        <DialogContent className="rounded-2xl bg-zinc-950 border-white/10">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tight text-white">Укажите причину отклонения</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <textarea
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[100px]"
              placeholder="Введите причину..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectionDialogOpen(false);
                setRejectionReason('');
                setDealToReject(null);
              }}
              className="border-white/10 text-white/60 hover:bg-white/5"
            >
              Отмена
            </Button>
            <Button
              onClick={() => {
                if (dealToReject && rejectionReason.trim()) {
                  statusMutation.mutate({ id: dealToReject, status: 'rejected', reason: rejectionReason });
                } else {
                  toast.error('Пожалуйста, укажите причину');
                }
              }}
              disabled={statusMutation.isPending || !rejectionReason.trim()}
              className="bg-red-500 hover:bg-red-600 text-white font-black uppercase tracking-wider"
            >
              {statusMutation.isPending ? 'Загрузка...' : 'Отклонить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tight">Удалить сделку?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-white/50">Это действие нельзя отменить.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDealToDelete(null); }}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => dealToDelete && deleteMutation.mutate(dealToDelete)}
              disabled={deleteMutation.isPending}
              className="font-black"
            >
              {deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
