import { useMemo, useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Pencil, Filter, DollarSign, Handshake, PiggyBank, Building2, TrendingUp } from 'lucide-react';
import { RoleBasedFilterBar } from '@/components/Deals/RoleBasedFilterBar';
import { DealsMortgageToggle } from '@/components/Deals/DealsMortgageToggle';
import { HierarchyBreadcrumb } from '@/components/Deals/HierarchyBreadcrumb';
import { GroupedMortgageBranchesView, MortgageBranchGroup } from '@/components/Mortgage/GroupedMortgageBranchesView';
import { MortgageFormDialog } from '@/components/Mortgage/MortgageFormDialog';
import { useAuth } from '@/hooks/useAuth';
import { useSharedData } from '@/hooks/useSharedData';
import type { MortgageServiceRow } from '@/hooks/useMortgageServices';
import { useMortgageMutations, useMortgageServices } from '@/hooks/useMortgageServices';
import { cn } from '@/lib/utils';
import { formatMoneyTrimTrailingZeros, formatCompactMoney } from '@/utils/formatters';
import { canAccessMortgageSection } from '@/lib/canAccessMortgage';

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const MORTGAGE_TABLE_TD = 'px-2 py-2.5 text-center align-middle border-r border-white/[0.045] last:border-r-0';
const MORTGAGE_TABLE_TH = 'border-r border-white/[0.045] last:border-r-0';

type MortgageNavItem = { label: string; level: 'company' | 'branch'; id?: string };

function fmtBrokerSalaryCell(row: MortgageServiceRow) {
  const n = Math.round(Number(row.broker_share) || 0);
  const amt = formatMoneyTrimTrailingZeros(n);
  if (row.broker_payout_status === 'paid') {
    const raw = row.broker_paid_at;
    let tail = '';
    if (raw) {
      try {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) {
          tail = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
        }
      } catch { /* ignore */ }
    }
    return tail ? `${amt} · выпл. ${tail}` : `${amt} · выплачено`;
  }
  return `${amt} · к выплате`;
}

function mortgageRowBankCols(row: MortgageServiceRow): { bank: string; program: string } {
  const r = row as MortgageServiceRow & { bank_name?: string; program_name?: string };
  let b = (r.bank_name != null ? String(r.bank_name) : '').trim();
  let p = (r.program_name != null ? String(r.program_name) : '').trim();
  if (!b && !p) {
    const raw = String(row.bank_program || '').trim();
    const idx = raw.indexOf(',');
    if (idx < 0) {
      b = raw;
    } else {
      b = raw.slice(0, idx).trim();
      p = raw.slice(idx + 1).trim();
    }
  }
  return { bank: b || '—', program: p || '—' };
}

function useMortgageGroupedRows(rows: MortgageServiceRow[]) {
  return useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.month !== b.month) return b.month - a.month;
      return new Date(b.deal_date).getTime() - new Date(a.deal_date).getTime();
    });
    type Item = { kind: 'group'; label: string; key: string } | { kind: 'row'; row: MortgageServiceRow };
    const out: Item[] = [];
    let prev = '';
    for (const row of sorted) {
      const gk = `${row.year}-${row.month}`;
      if (gk !== prev) {
        prev = gk;
        const label = `${MONTH_NAMES[row.month - 1]?.toLowerCase() || ''} ${row.year}`;
        out.push({ kind: 'group', label, key: gk });
      }
      out.push({ kind: 'row', row });
    }
    return out;
  }, [rows]);
}

function canEditMortgageRow(row: MortgageServiceRow, userId?: string | null, accessLevel?: number): boolean {
  if ((accessLevel || 0) >= 55) return true;
  const uid = userId || '';
  if (row.created_by && uid && row.created_by === uid) return true;
  if (row.broker_id && uid && row.broker_id === uid) return true;
  if (row.agent_id && uid && row.agent_id === uid) return true;
  return false;
}

function buildMortgageBranchGroups(rows: MortgageServiceRow[], branchNameById: Map<string, string>): MortgageBranchGroup[] {
  const map = new Map<string, { row_count: number; pending: number; svc: number; br: number; ag: number }>();
  for (const r of rows) {
    const key = r.branch_id || '';
    if (!map.has(key)) map.set(key, { row_count: 0, pending: 0, svc: 0, br: 0, ag: 0 });
    const g = map.get(key)!;
    g.row_count++;
    if (r.status === 'pending') g.pending++;
    if (r.status === 'approved') {
      g.svc += Number(r.service_cost) || 0;
      g.br += Number(r.broker_share) || 0;
      g.ag += Number(r.agency_share) || 0;
    }
  }
  const out: MortgageBranchGroup[] = [];
  for (const [key, v] of map) {
    const branch_name = key ? branchNameById.get(key) || 'Филиал' : 'Без филиала';
    out.push({
      branch_key: key,
      branch_name,
      row_count: v.row_count,
      pending_count: v.pending,
      total_service: v.svc,
      total_broker: v.br,
      total_agency: v.ag,
    });
  }
  out.sort((a, b) => a.branch_name.localeCompare(b.branch_name, 'ru'));
  return out;
}

function rowsForBranchDetail(rows: MortgageServiceRow[], pathBranchId: string | undefined, accessLevel: number): MortgageServiceRow[] {
  if (!pathBranchId) return rows;
  if (pathBranchId === '__none__') return rows.filter((r) => !r.branch_id);
  if (accessLevel >= 90) return rows.filter((r) => r.branch_id === pathBranchId);
  return rows.filter((r) => !r.branch_id || r.branch_id === pathBranchId);
}

function mortgageTotalsFromRows(rows: MortgageServiceRow[]) {
  let row_count = 0;
  let pending_count = 0;
  let total_service = 0;
  let total_broker = 0;
  let total_agency = 0;
  for (const r of rows) {
    row_count++;
    if (r.status === 'pending') pending_count++;
    if (r.status === 'approved') {
      total_service += Number(r.service_cost) || 0;
      total_broker += Number(r.broker_share) || 0;
      total_agency += Number(r.agency_share) || 0;
    }
  }
  return { row_count, pending_count, total_service, total_broker, total_agency };
}

/** Для директора на уровне «Компания»: все филиалы из справочника + суммы из строки (можно провалиться даже с 0 записей). */
function mergeDirectorBranchesWithMortgageTotals(
  allBranches: Array<{ id: string; name?: string }>,
  fromRowsAggregates: MortgageBranchGroup[],
  branchNameFallback: Map<string, string>
): MortgageBranchGroup[] {
  const agg = new Map<string, MortgageBranchGroup>();
  for (const g of fromRowsAggregates) {
    agg.set(g.branch_key, g);
  }

  const empty = (branch_key: string, branch_name: string): MortgageBranchGroup => ({
    branch_key,
    branch_name,
    row_count: 0,
    pending_count: 0,
    total_service: 0,
    total_broker: 0,
    total_agency: 0,
  });

  const merged: MortgageBranchGroup[] = [...allBranches]
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'))
    .map((b) => {
      const id = String(b.id);
      const existing = agg.get(id);
      if (existing)
        return {
          ...existing,
          branch_name: b.name || existing.branch_name || branchNameFallback.get(id) || 'Филиал',
        };
      return empty(id, b.name || branchNameFallback.get(id) || 'Филиал');
    });

  const un = agg.get('');
  merged.push({
    branch_key: '',
    branch_name: 'Без филиала',
    row_count: un?.row_count ?? 0,
    pending_count: un?.pending_count ?? 0,
    total_service: un?.total_service ?? 0,
    total_broker: un?.total_broker ?? 0,
    total_agency: un?.total_agency ?? 0,
  });
  return merged;
}

export default function MortgageDeals() {
  const { user, profile, role, accessLevel } = useAuth();
  const { branches } = useSharedData();
  const currentYear = new Date().getFullYear();
  const isDirector = accessLevel >= 90;
  const userBranchId = profile?.branch_id || user?.branch_id || '';

  const [filters, setFilters] = useState({
    year: currentYear,
    month: 0,
    searchQuery: '',
    dealStatus: 'all' as 'all' | 'pending' | 'approved' | 'rejected',
    minAmount: undefined as number | undefined,
    maxAmount: undefined as number | undefined,
  });

  const [navigationPath, setNavigationPath] = useState<MortgageNavItem[]>(() => {
    if (accessLevel >= 90) return [{ label: 'Компания', level: 'company' }];
    const bid = profile?.branch_id || user?.branch_id || '';
    if (bid) return [{ label: 'Филиал', level: 'branch', id: bid }];
    return [{ label: 'Компания', level: 'company' }];
  });

  useEffect(() => {
    if (isDirector || !userBranchId) return;
    const nm = branches.find((b: any) => String(b.id) === String(userBranchId))?.name;
    if (!nm) return;
    setNavigationPath((p) =>
      p.length === 1 && p[0].level === 'branch' && p[0].id === userBranchId && p[0].label === 'Филиал'
        ? [{ ...p[0], label: nm }]
        : p
    );
  }, [branches, userBranchId, isDirector]);

  const currentLevel = navigationPath[navigationPath.length - 1]?.level ?? 'company';
  const branchIdFromPath = navigationPath.find((p) => p.level === 'branch')?.id;

  const apiBranchId = isDirector && currentLevel === 'branch' && branchIdFromPath ? branchIdFromPath : undefined;

  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MortgageServiceRow | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: rows = [], isLoading, refetch } = useMortgageServices({
    year: filters.year,
    month: filters.month === 0 ? null : filters.month,
    search: filters.searchQuery,
    branch_id: apiBranchId,
    enabled: true,
  });

  const { create, update, remove } = useMortgageMutations();

  if (!canAccessMortgageSection(role ?? user?.role, accessLevel)) {
    return <Navigate to="/deals" replace />;
  }

  const filteredRows = useMemo(() => {
    let r = rows;
    if (filters.dealStatus !== 'all') r = r.filter((x) => x.status === filters.dealStatus);
    return r;
  }, [rows, filters.dealStatus]);

  const branchNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of branches || []) {
      if ((b as any)?.id) m.set(String((b as any).id), String((b as any).name || 'Филиал'));
    }
    return m;
  }, [branches]);

  const companyId = profile?.company_id || null;

  const companyBranchesFiltered = useMemo(() => {
    const list = (branches || []) as Array<{ id: string; name?: string; company_id?: string }>;
    if (!companyId) return list.filter((b) => b?.id);
    return list.filter((b) => b?.id && (!b.company_id || String(b.company_id) === String(companyId)));
  }, [branches, companyId]);

  const aggregatesFromRows = useMemo(
    () => buildMortgageBranchGroups(filteredRows, branchNameById),
    [filteredRows, branchNameById]
  );

  const branchGroups = useMemo(() => {
    if (currentLevel !== 'company') return [];
    if (isDirector) {
      return mergeDirectorBranchesWithMortgageTotals(companyBranchesFiltered, aggregatesFromRows, branchNameById);
    }
    return aggregatesFromRows;
  }, [currentLevel, isDirector, companyBranchesFiltered, aggregatesFromRows, branchNameById]);

  const branchGroupsFiltered = useMemo(() => branchGroups.filter((g) => g.row_count > 0), [branchGroups]);

  const companyTotals = useMemo(() => mortgageTotalsFromRows(filteredRows), [filteredRows]);

  const tableRows = useMemo(
    () => rowsForBranchDetail(filteredRows, branchIdFromPath, accessLevel),
    [filteredRows, branchIdFromPath, accessLevel]
  );

  const groupedTable = useMortgageGroupedRows(tableRows);
  const metricsRows = currentLevel === 'company' ? filteredRows : tableRows;
  const metrics = useMemo(() => {
    const approvedOnly = metricsRows.filter((x) => x.status === 'approved');
    const count = metricsRows.length;
    const serviceSum = approvedOnly.reduce((s, r) => s + Number(r.service_cost || 0), 0);
    const brokerSum = approvedOnly.reduce((s, r) => s + Number(r.broker_share || 0), 0);
    const agencySum = approvedOnly.reduce((s, r) => s + Number(r.agency_share || 0), 0);
    return { count, serviceSum, brokerSum, agencySum };
  }, [metricsRows]);

  const handleNavigate = (index: number) => {
    setNavigationPath(navigationPath.slice(0, index + 1));
  };

  const handleDrillBranch = (branchKey: string, branchName: string) => {
    const id = branchKey === '' ? '__none__' : branchKey;
    setNavigationPath((prev) => [...prev, { label: branchName, level: 'branch', id }]);
  };

  const breadcrumbPath = navigationPath as {
    label: string;
    level: 'company' | 'branch' | 'team' | 'employee';
    id?: string;
  }[];

  const formDefaultBranchId =
    branchIdFromPath && branchIdFromPath !== '__none__' ? branchIdFromPath : undefined;

  const filterUiLevel = currentLevel === 'company' ? 'company' : 'employee';

  const activeFilterCount =
    [
      filters.month !== 0,
      filters.dealStatus !== 'all',
      !!filters.minAmount,
      !!filters.maxAmount,
    ].filter(Boolean).length;

  return (
    <MainLayout>
      <div className="space-y-6 md:space-y-8 lg:space-y-10 animate-fade-in max-w-[1600px] mx-auto pb-16 md:pb-20 pt-4 md:pt-6 lg:pt-8 px-4 sm:px-8">
        {/* ── PREMIUM HEADER — как на странице «Сделки» ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6 lg:gap-8">
          <div className="space-y-2 md:space-y-3">
            <div className="mb-2">
              <img src="/logo-panel.svg" alt="" className="h-5 md:h-6 w-auto object-contain opacity-40" />
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white uppercase tracking-tighter leading-none">
              ИПОТЕКА
            </h1>
            <p className="text-xs md:text-sm font-black text-white/20 uppercase tracking-[0.3em] flex items-center gap-2">
              <span className="w-8 md:w-10 h-px bg-white/10" />
              {filters.month === 0 ? `Весь ${filters.year}` : `${MONTH_NAMES[filters.month - 1]} ${filters.year}`} ·{' '}
              реестр услуг
            </p>
          </div>
        </div>

        {/* ── BENTO STATS — та же сетка и карточки, что «Сделки» ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {[
            { label: 'Записей', sub: 'шт.', icon: Handshake, glow: 'bg-primary/10', border: 'border-primary/10', iconCls: 'text-primary', bg: 'group-hover:bg-primary/15', value: metrics.count },
            { label: 'Сумма услуг', sub: 'одобр.', icon: DollarSign, glow: 'bg-emerald-500/10', border: 'border-emerald-500/10', iconCls: 'text-emerald-400', bg: 'group-hover:bg-emerald-500/15', value: metrics.serviceSum, money: true },
            { label: 'ЗП брокера', sub: 'одобр.', icon: PiggyBank, glow: 'bg-violet-500/10', border: 'border-violet-500/10', iconCls: 'text-violet-400', bg: 'group-hover:bg-violet-500/15', value: metrics.brokerSum, money: true },
            { label: 'Доля агентства', sub: 'одобр.', icon: Building2, glow: 'bg-amber-500/10', border: 'border-amber-500/10', iconCls: 'text-amber-400', bg: 'group-hover:bg-amber-500/15', value: metrics.agencySum, money: true },
          ].map((card) => {
            const Icon = card.icon;
            const display =
              isLoading ? null : card.money ? formatCompactMoney(card.value as number) : String(card.value);
            return (
              <div
                key={card.label}
                className={`relative overflow-hidden rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/40 border border-white/5 p-5 md:p-6 lg:p-7 backdrop-blur-3xl group shadow-2xl`}
              >
                <div className={`absolute top-0 right-0 w-24 md:w-32 h-24 md:h-32 ${card.glow} blur-[60px] rounded-full pointer-events-none ${card.bg} transition-all duration-1000`} />
                <div className="relative z-10 space-y-3 md:space-y-4">
                  <div className={`p-2.5 md:p-3 ${card.glow} rounded-xl md:rounded-2xl border ${card.border} w-fit`}>
                    <Icon className={`h-5 w-5 md:h-6 md:w-6 ${card.iconCls}`} />
                  </div>
                  <div>
                    {display === null ? (
                      <div className="h-8 md:h-10 w-24 bg-white/10 rounded-lg animate-pulse" />
                    ) : (
                      <h2 className="text-2xl md:text-3xl lg:text-4xl font-black text-white tracking-tighter tabular-nums">{display}</h2>
                    )}
                    <p className="text-[9px] md:text-[10px] font-black text-white/20 uppercase tracking-[0.15em] md:tracking-[0.2em] mt-1">{card.label}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── HEADER ACTIONS — как «Сделки» ── */}
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between mb-8">
          <div className="flex min-w-0 flex-1 max-w-2xl flex-wrap items-center gap-4">
            <RoleBasedFilterBar
              accessLevel={accessLevel}
              filters={filters}
              onFiltersChange={setFilters}
              currentYear={currentYear}
              currentLevel={filterUiLevel}
              mode="header"
            />
            <DealsMortgageToggle />
            <Sheet open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'h-10 md:h-11 shrink-0 px-4 md:px-6 gap-2 bg-zinc-900/60 border-white/10 text-white hover:bg-white/5 rounded-xl transition-all',
                    activeFilterCount > 0 && 'border-primary/50 bg-primary/5 text-primary'
                  )}
                >
                  <Filter className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline font-bold uppercase tracking-widest text-[10px] whitespace-nowrap">Фильтры</span>
                  {activeFilterCount > 0 ? (
                    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white shrink-0">
                      {activeFilterCount}
                    </span>
                  ) : null}
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
                      onFiltersChange={(nf: typeof filters) => {
                        setFilters(nf);
                        setIsFiltersOpen(false);
                      }}
                      currentYear={currentYear}
                      currentLevel={filterUiLevel}
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
                setEditing(null);
                setDialogOpen(true);
              }}
              className="h-10 md:h-11 px-6 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 group"
            >
              <Plus className="h-4 w-4 mr-2 group-hover:rotate-90 transition-transform" />
              Добавить услугу
            </Button>
          </div>
        </div>

        {/* ── BREADCRUMB — после панели действий, как «Сделки» ── */}
        {navigationPath.length > 1 && (
          <HierarchyBreadcrumb path={breadcrumbPath} onNavigate={handleNavigate} />
        )}

        <AnimatePresence mode="wait">
          {currentLevel === 'company' ? (
            <motion.div key="grp" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <GroupedMortgageBranchesView
                groups={branchGroupsFiltered}
                totals={companyTotals}
                isLoading={isLoading}
                onDrillDown={
                  branchGroupsFiltered.length
                    ? (key, name) => handleDrillBranch(key === '__none__' ? '' : key, name)
                    : undefined
                }
              />
            </motion.div>
          ) : (
            <motion.div
              key="tbl"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between px-5 md:px-6 lg:px-8 py-4 md:py-5 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-xl border border-primary/10">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs md:text-sm font-black text-white uppercase tracking-wider">Ипотечные услуги</p>
                    <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">
                      {tableRows.length} {tableRows.length === 1 ? 'запись' : 'записей'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/5 bg-black/20">
                      {[
                        ['Статус', ''],
                        ['Дата', ''],
                        ['Банк', ''],
                        ['Программа', ''],
                        ['Стоимость', ''],
                        ['Клиент', ''],
                        ['Брокер', ''],
                        ['Агент', ''],
                        ['ЗП брокера', 'font-mono bg-emerald-500/[0.04]'],
                        ['', 'w-14 px-1 min-w-[4.5rem]'],
                      ].map(([col, cls], hci) => (
                        <th
                          key={`mc-${hci}`}
                          className={`px-2 py-3 text-[9px] font-black text-white/20 uppercase tracking-wider text-center align-middle whitespace-nowrap ${MORTGAGE_TABLE_TH} ${cls}`}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={10} className="py-20 text-center">
                          <div className="flex items-center justify-center gap-2 text-white/20">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                            <span className="font-black uppercase tracking-wider text-[10px]">Загрузка…</span>
                          </div>
                        </td>
                      </tr>
                    ) : groupedTable.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-20 text-center">
                          <p className="text-xs font-black text-white/10 uppercase tracking-widest">
                            {filters.searchQuery ? 'Ничего не найдено' : 'Нет записей за выбранный период'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      groupedTable.map((item, idx) => {
                        if (item.kind === 'group') {
                          return (
                            <tr key={`g-${item.key}`} className="border-t border-white/[0.04] bg-white/[0.02]">
                              <td colSpan={10} className="px-4 py-2.5">
                                <p className="text-[10px] font-black text-white/35 uppercase tracking-[0.2em]">{item.label}</p>
                              </td>
                            </tr>
                          );
                        }
                        const row = item.row;
                        const { bank: bankCol, program: programCol } = mortgageRowBankCols(row);
                        return (
                          <motion.tr
                            key={row.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: idx * 0.008 }}
                            className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors group"
                          >
                            <td className={cn(MORTGAGE_TABLE_TD, 'whitespace-nowrap')}>
                              <div className={cn('inline-flex flex-col items-center gap-1')}>
                                <div
                                  className={cn(
                                    'inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter',
                                    row.status === 'approved' &&
                                      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                                    row.status === 'rejected' &&
                                      'bg-red-500/10 text-red-400 border border-red-500/20',
                                    row.status === 'pending' &&
                                      'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  )}
                                >
                                  {row.status === 'approved'
                                    ? 'Одобрено'
                                    : row.status === 'rejected'
                                      ? 'Отклонено'
                                      : 'Ожидает'}
                                </div>
                                {row.status === 'rejected' && row.rejection_reason ? (
                                  <p
                                    className="text-[8px] font-bold text-red-400/60 max-w-[100px] break-words leading-tight italic text-center"
                                    title={row.rejection_reason}
                                  >
                                    «{row.rejection_reason}»
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className={cn(MORTGAGE_TABLE_TD, 'text-white/90 whitespace-nowrap')}>
                              {row.deal_date ? new Date(row.deal_date).toLocaleDateString('ru-RU') : '—'}
                            </td>
                            <td className={cn(MORTGAGE_TABLE_TD, 'text-white')} title={bankCol}>
                              <div className="mx-auto max-w-[160px] truncate">{bankCol}</div>
                            </td>
                            <td className={cn(MORTGAGE_TABLE_TD, 'text-white/80')} title={programCol}>
                              <div className="mx-auto max-w-[180px] truncate">{programCol}</div>
                            </td>
                            <td className={cn(MORTGAGE_TABLE_TD, 'font-mono text-white whitespace-nowrap')}>
                              {formatMoneyTrimTrailingZeros(row.service_cost)}
                            </td>
                            <td className={cn(MORTGAGE_TABLE_TD, 'text-white/90 whitespace-nowrap')}>{row.client_name || '—'}</td>
                            <td className={cn(MORTGAGE_TABLE_TD, 'text-white/60 whitespace-nowrap')}>{row.broker_name || '—'}</td>
                            <td className={cn(MORTGAGE_TABLE_TD, 'text-white/60 whitespace-nowrap')}>{row.agent_name || '—'}</td>
                            <td
                              className={cn(
                                MORTGAGE_TABLE_TD,
                                'font-mono font-bold whitespace-nowrap bg-emerald-500/[0.04]',
                                row.broker_payout_status === 'paid' ? 'text-emerald-400' : 'text-amber-400/90'
                              )}
                            >
                              {fmtBrokerSalaryCell(row)}
                            </td>
                            <td className={cn(MORTGAGE_TABLE_TD, 'whitespace-nowrap w-14 min-w-[4.5rem] px-1')}>
                              {canEditMortgageRow(row, user?.id, accessLevel) ? (
                                <div className="flex justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => { setEditing(row); setDialogOpen(true); }}
                                    className="p-1.5 rounded-lg text-blue-400/70 hover:bg-blue-500/10"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setDeleteId(row.id); setDeleteDialogOpen(true); }}
                                    className="p-1.5 rounded-lg text-red-400/70 hover:bg-red-500/10"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-white/10">—</span>
                              )}
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

      <MortgageFormDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}
        editing={editing}
        defaultBranchId={formDefaultBranchId}
        isSubmitting={create.isPending || update.isPending}
        onSubmit={async (body) => {
          if (editing) await update.mutateAsync({ id: editing.id, body });
          else await create.mutateAsync(body);
          setDialogOpen(false);
          setEditing(null);
          refetch();
        }}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="rounded-2xl bg-zinc-950 border-white/10">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tight text-white">Удалить запись?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-white/50">Это действие нельзя отменить.</p>
          <DialogFooter>
            <Button variant="outline" className="border-white/10" onClick={() => { setDeleteDialogOpen(false); setDeleteId(null); }}>Отмена</Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={async () => {
                if (!deleteId) return;
                await remove.mutateAsync(deleteId);
                setDeleteDialogOpen(false);
                setDeleteId(null);
                refetch();
              }}
            >
              {remove.isPending ? 'Удаление…' : 'Удалить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
