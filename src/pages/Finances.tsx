// Finances Page - Uses unified KPI API (Plan 02-05)
// Financial data matches Dashboard and Deals page exactly
import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  ArrowUpRight, ArrowDownRight,
  Filter, Trash2, RefreshCw, Loader2,
  Zap, Wallet, DollarSign, CreditCard, Pencil,
  Activity, PieChart, LineChart
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useFinances } from '@/hooks/useFinances';
import { useDealForecastQuery } from '@/hooks/useDealForecastQuery';
import { forecastAgencyRevenueFromDeals } from '@/utils/dealForecast';
import { parseUTCDate } from '@/lib/date-utils';
import { localAPI } from '@/integrations/localAPI';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, TooltipProps, CartesianGrid } from 'recharts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AddTransactionDialog } from '@/components/finances/AddTransactionDialog';
import { EditTransactionDialog } from '@/components/finances/EditTransactionDialog';
import { RecurringExpenses } from '@/components/finances/RecurringExpenses';
import { SalarySchedule } from '@/components/finances/SalarySchedule';
import { useToast } from '@/hooks/use-toast';
import { formatMoney, formatInteger, formatCompactMoney } from '@/utils/formatters';
import { formatExpenseDescriptionForUi } from '@/lib/financeDisplay';
// --- Types & Constants ---
const categoryLabels: Record<string, string> = {
  commission: 'Комиссии',
  deal_commission: 'Комиссия по сделке',
  bonus: 'Бонусы',
  premium: 'Премии',
  other_income: 'Прочие доходы',
  salary: 'Зарплата',
  salary_advance_net: 'Зарплата: аванс (на руки)',
  salary_remainder_net: 'Зарплата: остаток (на руки)',
  payroll_ndfl_budget_1: 'НДФЛ 1 (с аванса)',
  payroll_ndfl_budget_2: 'НДФЛ 2 (с остатка)',
  payroll_insurance_contributions: 'Страховые взносы',
  mortgage_service_fee: 'Ипотечная услуга',
  deal_deposit: 'Задаток по сделке',
  rent: 'Аренда',
  marketing: 'Маркетинг',
  utilities: 'Коммунальные',
  subscription: 'Подписки',
  taxes: 'Налоги',
  other_expense: 'Прочие расходы',
};

const COLORS = ['#6366f1', '#f43f5e', '#8b5cf6', '#f59e0b', '#06b6d4'];
const NEON_PRIMARY = 'hsl(var(--primary))';
const NEON_GREEN = '#818cf8'; // Indigo for positive flow
const NEON_RED = '#f43f5e';   // Rose for negative flow

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-950/90 border border-white/10 p-3 rounded-xl backdrop-blur-xl shadow-xl">
        <p className="text-xs text-muted-foreground mb-2">{format(parseUTCDate(label), 'd MMMM yyyy', { locale: ru })}</p>
        {payload.map((entry: any) => (
          <div key={entry.name} className="flex items-center gap-2 mb-1 last:mb-0">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-xs font-medium text-white capitalize">{entry.name === 'income' ? 'Доход' : 'Расход'}:</span>
            <span className="text-xs font-mono font-bold" style={{ color: entry.color }}>
              {formatMoney(entry.value)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

interface AnalyticsData {
  chartData: any[];
  categoryData: any[];
}

function useFinanceAnalytics() {
  return useQuery({
    queryKey: ['finance-analytics'],
    queryFn: async () => {
      const now = new Date();
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      const { data: allTransactions, error } = await localAPI.request('/finances/transactions');
      if (error) throw error;

      const transactionsArray = Array.isArray(allTransactions?.data) ? allTransactions.data : (Array.isArray(allTransactions) ? allTransactions : []);
      const transactions = transactionsArray.filter((tx: any) => {
        const txDate = parseUTCDate(tx.created_at);
        return txDate >= start && txDate <= end;
      }).sort((a: any, b: any) => parseUTCDate(a.created_at).getTime() - parseUTCDate(b.created_at).getTime());

      const dailyData: Record<string, { date: string; income: number; expense: number }> = {};
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = format(d, 'yyyy-MM-dd');
        dailyData[dateStr] = { date: dateStr, income: 0, expense: 0 };
      }

      transactions?.forEach((tx: any) => {
        const dateStr = format(parseUTCDate(tx.created_at), 'yyyy-MM-dd');
        if (dailyData[dateStr]) {
          if (tx.type === 'income') dailyData[dateStr].income += Number(tx.amount);
          else dailyData[dateStr].expense += Number(tx.amount);
        }
      });

      const categoryBreakdown: Record<string, number> = {};
      transactions?.forEach((tx: any) => {
        if (tx.type !== 'expense') return;
        const cat = tx.category;
        categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + Number(tx.amount);
      });

      return {
        chartData: Object.values(dailyData),
        categoryData: Object.entries(categoryBreakdown).map(([name, value]) => ({ name, value })),
      };
    },
    staleTime: 300000,
    gcTime: 900000,
    refetchOnWindowFocus: false,
  });
}

function FinanceFlowCard({ data, className }: { data?: any[], className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl md:rounded-2xl lg:rounded-[2.5rem] bg-zinc-900/60 backdrop-blur-3xl border border-white/5 p-5 md:p-6 lg:p-8 flex flex-col h-[350px] md:h-[450px] lg:h-[500px]", className)}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
      <div className="flex items-center gap-1.5 md:gap-2 mb-5 md:mb-6 lg:mb-8 relative z-10 flex-none">
        <div className="p-2 md:p-2.5 lg:p-3 bg-primary/10 rounded-xl md:rounded-2xl border border-primary/20">
          <Activity className="h-4 w-4 md:h-4.5 md:w-4.5 lg:h-5 lg:w-5 text-primary" />
        </div>
        <h3 className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Финансовый поток</h3>
      </div>

      <div className="w-full flex-1 relative z-10 min-h-[250px] md:min-h-[300px] lg:min-h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={NEON_GREEN} stopOpacity={0.3} />
                <stop offset="95%" stopColor={NEON_GREEN} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={NEON_RED} stopOpacity={0.3} />
                <stop offset="95%" stopColor={NEON_RED} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9 }}
              tickFormatter={(value) => format(parseUTCDate(value), 'dd.MM')}
              minTickGap={20}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9 }}
              tickFormatter={(value) => `${value / 1000}k`}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'white', strokeWidth: 1, strokeDasharray: '4 4', strokeOpacity: 0.2 }} />
            <Area type="monotone" dataKey="income" stroke={NEON_GREEN} strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" />
            <Area type="monotone" dataKey="expense" stroke={NEON_RED} strokeWidth={2} fillOpacity={1} fill="url(#colorExpense)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ExpenseStructureCard({ data, className }: { data?: any[], className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl md:rounded-2xl lg:rounded-[2.5rem] bg-zinc-900/60 backdrop-blur-3xl border border-white/5 p-5 md:p-6 lg:p-8 flex flex-col h-[350px] md:h-[450px] lg:h-[500px]", className)}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
      <div className="flex items-center gap-1.5 md:gap-2 mb-5 md:mb-6 lg:mb-8 relative z-10 flex-none">
        <div className="p-2 md:p-2.5 lg:p-3 bg-primary/10 rounded-xl md:rounded-2xl border border-primary/20">
          <PieChart className="h-4 w-4 md:h-4.5 md:w-4.5 lg:h-5 lg:w-5 text-primary" />
        </div>
        <h3 className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Структура расходов</h3>
      </div>

      <div className="flex flex-col items-center justify-center pb-1 md:pb-2 relative z-10 flex-1 overflow-hidden">
        <div className="flex-1 min-h-[200px] md:min-h-[250px] lg:min-h-[300px] w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPie>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                stroke="none"
                paddingAngle={4}
              >
                {data?.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#09090b', borderRadius: '12px', border: '1px solid #27272a' }} itemStyle={{ color: '#fff' }} />
            </RechartsPie>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <DollarSign className="h-8 w-8 md:h-9 md:w-9 lg:h-10 lg:w-10 text-white/20" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:gap-3 w-full mt-3 md:mt-4 flex-none">
          {data?.slice(0, 4).map((entry: any, index: number) => (
            <div key={entry.name} className="flex items-center gap-1.5 md:gap-2 p-1.5 md:p-2 rounded-lg bg-white/5">
              <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: COLORS[index % COLORS.length], color: COLORS[index % COLORS.length] }} />
              <span className="text-[10px] md:text-xs font-medium text-zinc-300 truncate">{categoryLabels[entry.name] || entry.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Finances() {
  const { user, isDirector, canManageFinances, accessLevel } = useAuth();
  const isFinanceManagement = canManageFinances || accessLevel >= 90 || isDirector;
  const { transactions, stats, addTransaction, isAdding, isLoading, deleteTransaction, updateTransaction, isUpdating } = useFinances();
  const { data: analyticsData, isLoading: isAnalyticsLoading } = useFinanceAnalytics();
  const [editingTx, setEditingTx] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /** Прогноз считается по всем месяцам текущего года — иначе сделки из других месяцев дают 0 ₽. */
  const financeForecastPeriod = useMemo(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: null as number | null };
  }, []);

  const financeForecastLevel =
    accessLevel >= 90 ? ('company' as const) : accessLevel >= 50 ? ('team' as const) : ('employee' as const);

  const financeForecastQuery = useDealForecastQuery(
    isFinanceManagement,
    financeForecastLevel,
    accessLevel,
    {
      ...financeForecastPeriod,
      isMyDealsOnly: accessLevel >= 90 ? false : undefined,
    }
  );

  const financeForecastStats = useMemo(
    () => forecastAgencyRevenueFromDeals(financeForecastQuery.data ?? []),
    [financeForecastQuery.data]
  );

  const groupedTransactions = useMemo(() => {
    const list = [...(transactions || [])].sort(
      (a: any, b: any) => parseUTCDate(b.created_at).getTime() - parseUTCDate(a.created_at).getTime()
    );
    const byMonth = new Map<string, typeof list>();
    for (const tx of list) {
      const d = parseUTCDate(tx.created_at);
      const key = format(d, 'yyyy-MM');
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(tx);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, items]) => ({
        key,
        title: format(new Date(`${key}-01T12:00:00`), 'LLLL yyyy', { locale: ru }),
        items,
      }));
  }, [transactions]);

  const recalculateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await localAPI.request('/finances/recalculate', {
        method: 'POST',
        body: { all: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      // After server-side recalc, force-refresh all finance-related cached data.
      // Use refetchQueries to fetch immediately (instead of just marking stale).
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['transactions'] }),
        queryClient.refetchQueries({ queryKey: ['finance-analytics'] }),
        queryClient.refetchQueries({ queryKey: ['finance-stats'] }),
        queryClient.refetchQueries({ queryKey: ['recurring-expenses'] }),
        queryClient.refetchQueries({ queryKey: ['salaried-employees-list'] }),
        // KPI widgets use separate keys; refetch so UI updates immediately
        queryClient.refetchQueries({ queryKey: ['kpi'] }),
        queryClient.refetchQueries({ queryKey: ['dual-kpi'] }),
        queryClient.refetchQueries({ queryKey: ['dual-kpi-stats'] }),
        queryClient.refetchQueries({ queryKey: ['my-kpi-stats-detailed'] }),
        queryClient.refetchQueries({ queryKey: ['dashboard-kpi-stats'] }),
        queryClient.refetchQueries({ queryKey: ['deal-forecast-rows'] }),
      ]);

      const updatedTotal = data?.updated_total ?? data?.deals_updated ?? 0;
      const periods = Array.isArray(data?.periods) ? data.periods : [];
      const periodsHint = periods.length ? `Периодов: ${periods.length}` : '';

      toast({
        title: 'Финансы пересчитаны',
        description: `Обновлено сделок: ${updatedTotal}${periodsHint ? ` • ${periodsHint}` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Ошибка пересчета',
        description: error.message || 'Не удалось пересчитать финансы',
        variant: 'destructive',
      });
    },
  });

  if (isLoading || isAnalyticsLoading) {
    return (
      <MainLayout>
        <div className="space-y-6 max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
          <div className="flex items-center justify-center py-12" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 md:space-y-8 animate-fade-in pb-16 md:pb-20 max-w-[1600px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8">

        {/* Header */}
        <div className="relative pt-6 md:pt-8 lg:pt-10">
          <div className="absolute -left-20 -top-20 w-48 h-48 md:w-64 md:h-64 bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
          <div className="relative z-10 footer-gradient p-6 md:p-8 lg:p-10 rounded-2xl md:rounded-[2.5rem] lg:rounded-[3rem] border border-white/5 overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 md:gap-6 lg:gap-8">
              <div className="space-y-2.5 md:space-y-3 lg:space-y-4">
                <div className="mb-2 md:mb-3">
                  <img src="/logo-panel.svg" alt="Logo" className="h-5 md:h-6 lg:h-7 w-auto object-contain opacity-40" />
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="h-px w-6 md:w-8 bg-primary/50" />
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-primary/60">Финансовый контроль</span>
                </div>
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tighter leading-none">
                  ФИНАНСЫ <span className="text-white/20">/ ОБЗОР</span>
                </h1>
                <p className="text-white/40 font-medium max-w-md flex items-center gap-1.5 md:gap-2 uppercase text-[9px] md:text-[10px] tracking-widest">
                  <Zap className="h-3.5 w-3.5 md:h-4 md:w-4 text-amber-400 fill-amber-400 animate-pulse" />
                  Анализ движения капитала и доходности в реальном времени
                </p>
              </div>
              {isFinanceManagement && (
                <div className="flex flex-col gap-2 md:gap-3">
                  <div className="flex gap-2 p-2 bg-zinc-900/60 rounded-2xl border border-white/10 backdrop-blur-xl">
                    <AddTransactionDialog type="income" onAdd={addTransaction} isAdding={isAdding} />
                    <div className="w-px bg-white/10 my-2" />
                    <AddTransactionDialog type="expense" onAdd={addTransaction} isAdding={isAdding} />
                  </div>
                  <Button
                    onClick={() => recalculateMutation.mutate()}
                    disabled={recalculateMutation.isPending}
                    variant="outline"
                    className="w-full"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${recalculateMutation.isPending ? 'animate-spin' : ''}`} />
                    Обновить финансы
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Top Cards - Neon & Glass */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4 lg:gap-6">
          {isFinanceManagement && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="relative group">
              <div className="relative overflow-hidden rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/60 backdrop-blur-3xl border border-white/5 p-5 md:p-6 lg:p-8 hover:border-primary/30 transition-all duration-500 h-full flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4 md:mb-5 lg:mb-6">
                  <div className="p-2.5 md:p-3 lg:p-4 bg-primary/10 rounded-xl md:rounded-2xl text-primary border border-primary/20">
                    <Wallet className="h-5 w-5 md:h-5.5 md:w-5.5 lg:h-6 lg:w-6" />
                  </div>
                  <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 px-2 md:px-3 py-0.5 md:py-1 rounded-lg font-black text-[9px] md:text-[10px] tracking-widest uppercase">Итого</Badge>
                </div>
                <div className="space-y-0.5 md:space-y-1">
                  <p className="text-[9px] md:text-[10px] text-white/40 font-black uppercase tracking-widest">Общий баланс</p>
                  <h2 className="text-2xl md:text-2xl lg:text-3xl font-black text-white tracking-tight tabular-nums">{formatMoney(stats.balanceCash + stats.balanceAccount)}</h2>
                </div>
              </div>
            </motion.div>
          )}

          {isFinanceManagement && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="relative group">
              <div className="relative overflow-hidden rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/60 backdrop-blur-3xl border border-white/5 p-5 md:p-6 lg:p-8 hover:border-primary/30 transition-all duration-500 h-full flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4 md:mb-5 lg:mb-6">
                  <div className="p-2.5 md:p-3 lg:p-4 bg-primary/10 rounded-xl md:rounded-2xl text-primary border border-primary/20">
                    <DollarSign className="h-5 w-5 md:h-5.5 md:w-5.5 lg:h-6 lg:w-6" />
                  </div>
                  <div className="text-[9px] md:text-[10px] font-black text-primary bg-primary/10 px-2 md:px-3 py-0.5 md:py-1 rounded-lg border border-primary/20 tracking-widest uppercase">+2.5%</div>
                </div>
                <div className="space-y-0.5 md:space-y-1">
                  <p className="text-[9px] md:text-[10px] text-white/40 font-black uppercase tracking-widest">В кассе</p>
                  <h2 className="text-xl md:text-xl lg:text-2xl font-black text-white tracking-tight tabular-nums">{formatMoney(stats.balanceCash)}</h2>
                </div>
              </div>
            </motion.div>
          )}

          {isFinanceManagement && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="relative group">
              <div className="relative overflow-hidden rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/60 backdrop-blur-3xl border border-white/5 p-5 md:p-6 lg:p-8 hover:border-primary/30 transition-all duration-500 h-full flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4 md:mb-5 lg:mb-6">
                  <div className="p-2.5 md:p-3 lg:p-4 bg-primary/10 rounded-xl md:rounded-2xl text-primary border border-primary/20">
                    <CreditCard className="h-5 w-5 md:h-5.5 md:w-5.5 lg:h-6 lg:w-6" />
                  </div>
                  <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5 px-2 md:px-3 py-0.5 md:py-1 rounded-lg font-black text-[9px] md:text-[10px] tracking-widest uppercase">Безнал</Badge>
                </div>
                <div className="space-y-0.5 md:space-y-1">
                  <p className="text-[9px] md:text-[10px] text-white/40 font-black uppercase tracking-widest">На счету</p>
                  <h2 className="text-xl md:text-xl lg:text-2xl font-black text-white tracking-tight tabular-nums">{formatMoney(stats.balanceAccount)}</h2>
                </div>
              </div>
            </motion.div>
          )}

          {isFinanceManagement && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="relative group">
              <div className="relative overflow-hidden rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/60 backdrop-blur-3xl border border-white/5 p-5 md:p-6 lg:p-8 hover:border-amber-500/30 transition-all duration-500 h-full flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4 md:mb-5 lg:mb-6">
                  <div className="p-2.5 md:p-3 lg:p-4 bg-amber-500/10 rounded-xl md:rounded-2xl text-amber-400 border border-amber-500/20">
                    <TrendingUp className="h-5 w-5 md:h-5.5 md:w-5.5 lg:h-6 lg:w-6" />
                  </div>
                  <Badge variant="outline" className="border-white/10 text-white/40 bg-white/5 px-2 md:px-3 py-0.5 md:py-1 rounded-lg font-black text-[9px] md:text-[10px] tracking-widest uppercase">Месяц</Badge>
                </div>
                <div className="space-y-2 md:space-y-3">
                  <div className="flex justify-between text-[9px] md:text-[10px] font-black uppercase tracking-widest">
                    <span className="text-primary">+{formatMoney(stats.income)}</span>
                    <span className="text-rose-500">-{formatMoney(stats.expense)}</span>
                  </div>
                  <div className="h-1.5 md:h-2 w-full bg-white/5 rounded-full overflow-hidden flex border border-white/5">
                    <div className="h-full bg-primary shadow-[0_0_10px_rgba(var(--primary),0.3)] transition-all duration-1000" style={{ width: `${(stats.income / (stats.income + stats.expense || 1)) * 100}%` }} />
                    <div className="h-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.3)] transition-all duration-1000" style={{ width: `${(stats.expense / (stats.income + stats.expense || 1)) * 100}%` }} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {isFinanceManagement && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="relative group sm:col-span-2 xl:col-span-1"
            >
              <div className="relative overflow-hidden rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/60 backdrop-blur-3xl border border-white/5 p-5 md:p-6 lg:p-8 hover:border-cyan-500/30 transition-all duration-500 h-full flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4 md:mb-5 lg:mb-6">
                  <div className="p-2.5 md:p-3 lg:p-4 bg-cyan-500/10 rounded-xl md:rounded-2xl text-cyan-400 border border-cyan-500/20">
                    <LineChart className="h-5 w-5 md:h-5.5 md:w-5.5 lg:h-6 lg:w-6" />
                  </div>
                  <Badge
                    variant="outline"
                    className="border-cyan-500/30 text-cyan-400 bg-cyan-500/5 px-2 md:px-3 py-0.5 md:py-1 rounded-lg font-black text-[9px] md:text-[10px] tracking-widest uppercase"
                  >
                    Сделки
                  </Badge>
                </div>
                <div className="space-y-0.5 md:space-y-1">
                  <p className="text-[9px] md:text-[10px] text-white/40 font-black uppercase tracking-widest">Прогноз по сделкам</p>
                  {financeForecastQuery.isLoading ? (
                    <div className="h-9 md:h-10 w-40 bg-white/10 rounded-lg animate-pulse" />
                  ) : (
                    <h2 className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight tabular-nums">
                      {formatMoney(financeForecastStats.remaining)}
                    </h2>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6 items-stretch">
          <FinanceFlowCard data={analyticsData?.chartData} className="md:col-span-2" />
          <ExpenseStructureCard data={analyticsData?.categoryData} className="md:col-span-1" />
        </div>

        {/* High-level stats panel - Hidden for management */}
        {!isFinanceManagement && (
          <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/5 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Скорость трат (мес)</p>
              <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-red-500/50" style={{ width: '45%' }} />
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Эффективность доходов</p>
              <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-green-500/50" style={{ width: '78%' }} />
              </div>
            </div>
          </div>
        )}

        {/* Transactions Tables - Full Width */}
        <div className="w-full space-y-6">
          <Tabs defaultValue="transactions" className="w-full">
            {isFinanceManagement && (
              <TabsList className="mb-6">
                <TabsTrigger value="transactions">Все операции</TabsTrigger>
                <TabsTrigger value="salary">Зарплаты</TabsTrigger>
                <TabsTrigger value="recurring">Постоянные</TabsTrigger>
              </TabsList>
            )}

            <TabsContent value="transactions" className="space-y-4">
              <Card className="glass-card border-white/5">
                <CardHeader>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Операции по месяцам</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-8">
                    {groupedTransactions.map((group) => (
                      <div key={group.key} className="space-y-3">
                        <div className="flex items-center gap-3 px-1">
                          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/90 whitespace-nowrap">
                            {group.title.charAt(0).toUpperCase() + group.title.slice(1)}
                          </span>
                          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                        </div>
                        <div className="space-y-2">
                          {group.items.map((tx: any) => (
                      <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/5 group">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "p-3 rounded-xl transition-colors",
                            tx.type === 'income' ? "bg-green-500/10 text-green-500 group-hover:bg-green-500/20" : "bg-red-500/10 text-red-500 group-hover:bg-red-500/20"
                          )}>
                            {tx.type === 'income' ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                          </div>
                          <div>
                            <p className="font-bold text-white truncate max-w-[300px] md:max-w-[500px] lg:max-w-2xl" title={formatExpenseDescriptionForUi(tx.description)}>
                              {formatExpenseDescriptionForUi(tx.description)}
                            </p>
                            <div className="flex gap-2 mt-1">
                              <Badge variant="secondary" className="text-[10px] px-1.5 bg-white/5 hover:bg-white/10 text-muted-foreground">
                                {categoryLabels[tx.category] || tx.category}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className={cn("font-mono font-bold text-lg tabular-nums", tx.type === 'income' ? "text-green-500" : "text-red-500")}>
                              {tx.type === 'income' ? '+' : '-'}{formatMoney(tx.amount)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(parseUTCDate(tx.created_at), 'd MMMM yyyy, HH:mm', { locale: ru })}
                            </p>
                          </div>
                          {isFinanceManagement && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingTx(tx); }}
                                className="p-2 rounded-lg text-zinc-500 hover:text-primary hover:bg-primary/10 transition-all"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button
                                    className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="sm:rounded-2xl">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Удалить транзакцию?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Это действие навсегда удалит запись о данной операции из истории финансов.
                                      Отменить это действие будет невозможно.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-xl">Отмена</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => deleteTransaction(tx.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
                                    >
                                      Удалить
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          )}
                        </div>
                      </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {isFinanceManagement && <TabsContent value="salary"><SalarySchedule /></TabsContent>}
            {isFinanceManagement && <TabsContent value="recurring"><RecurringExpenses /></TabsContent>}
          </Tabs>
        </div>

      </div>

      {/* Edit Transaction Dialog — п.13 */}
      {editingTx && (
        <EditTransactionDialog
          transaction={editingTx}
          open={!!editingTx}
          onOpenChange={(open) => { if (!open) setEditingTx(null); }}
          onSave={(payload) => { updateTransaction(payload); setEditingTx(null); }}
          isSaving={isUpdating}
        />
      )}
    </MainLayout>
  );
}

export default Finances;
