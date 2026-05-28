import { motion } from 'framer-motion';
import { memo, useState } from 'react';
import { BarChart3, Users, Target, Calendar, Trophy, Activity, Home, DollarSign, Building2, ArrowUpRight, ArrowDownRight, Star, Layout, Award, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useSharedData } from '@/hooks/useSharedData';
import { useAuth } from '@/hooks/useAuth';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn, getAvatarUrl } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DetailedAnalytics } from '@/components/analytics/DetailedAnalytics';

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

const CustomTooltip = memo(function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-900/90 border border-white/10 p-3 rounded-xl backdrop-blur-xl shadow-xl shadow-primary/10">
        <p className="text-[10px] text-muted-foreground mb-2 uppercase font-black tracking-widest">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 mb-1 last:mb-0">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">{entry.name}:</span>
            <span className="text-[10px] font-black tabular-nums" style={{ color: entry.color }}>
              {Number(entry.value).toLocaleString('ru-RU')}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
});

export default function Analytics() {
  const {
    dailyStats, employeePerformance, kpis, aggregatedTargets, isLoading,
    branchId, setBranchId, teamId, setTeamId, teams, period, setPeriod, selectedDate,
    currentQuarterKPI, prevQuarterKPI, currentPeriodLabel, prevPeriodLabel
  } = useAnalytics();

  const [viewMode, setViewMode] = useState<'overview' | 'detailed'>('overview');
  const { branches } = useSharedData();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const accessLevel = profile?.access_level ?? 0;

  const chartData = dailyStats.map(d => ({
    ...d,
    dateLabel: format(new Date(d.date), 'd MMM', { locale: ru }),
  }));

  const kpiCards = [
    {
      label: 'Сделки',
      value: kpis.totalDeals || 0,
      target: aggregatedTargets?.target_deals || 0,
      icon: Target,
      color: 'text-rose-500',
      trend: kpis.trends?.deals || '0%',
    },
    {
      label: 'Задатки',
      value: kpis.totalDeposits || 0,
      target: aggregatedTargets?.target_deposits || 0,
      icon: DollarSign,
      color: 'text-emerald-500',
      trend: kpis.trends?.deposits || '0%',
    },
    {
      label: 'Объекты',
      value: kpis.totalObjects || 0,
      target: aggregatedTargets?.target_objects || 0,
      icon: Home,
      color: 'text-primary',
      trend: kpis.trends?.objects || '0%',
    },
    {
      label: 'Встречи',
      value: kpis.totalMeetings || 0,
      target: aggregatedTargets?.target_meetings || 0,
      icon: Users,
      color: 'text-purple-500',
      trend: kpis.trends?.meetings || '0%',
    },
  ];

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-6 animate-fade-in max-w-[1600px] mx-auto p-4 md:p-8">
          <Skeleton className="h-40 w-full rounded-[2rem] bg-white/5" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-3xl bg-white/5" />)}
          </div>
          <Skeleton className="h-[400px] w-full rounded-[2rem] bg-white/5" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 md:space-y-8 animate-fade-in max-w-[1600px] mx-auto pb-20 px-3 sm:px-4 md:px-6 lg:px-8">

        {/* Header & Filters */}
        <div className="relative pt-2 md:pt-4 lg:pt-6 xl:pt-10">
          <div className="absolute -left-20 -top-20 w-64 h-64 bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
          <div className="relative z-10 footer-gradient p-4 sm:p-6 md:p-8 rounded-[1.5rem] md:rounded-[3rem] border border-white/5 overflow-hidden group shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 md:gap-8">
              <div className="space-y-2 md:space-y-4">
                <div className="mb-2 md:mb-4">
                  <img src="/logo-panel.svg" alt="Logo" className="h-6 md:h-8 w-auto object-contain opacity-40 grayscale group-hover:grayscale-0 transition-all duration-500" />
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="h-px w-6 md:w-10 bg-primary/50" />
                  <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-primary/60">Аналитический центр</span>
                </div>
                <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter leading-[0.9]">
                  АНАЛИТИКА <span className="text-white/20">/ ЭФФЕКТИВНОСТЬ</span>
                </h1>
                <p className="text-white/40 font-bold max-w-lg flex items-center gap-2 uppercase text-[9px] md:text-[11px] tracking-widest leading-loose hidden sm:flex">
                  <Activity className="h-4 w-4 text-primary fill-primary/20 animate-pulse" />
                  Глубокий анализ показателей эффективности команды и филиалов
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
                <div className="flex flex-col gap-1.5 md:gap-2 min-w-[200px]">
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider text-white/30 ml-2">Подразделение</span>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger className="w-full bg-zinc-900 border-white/5 text-white rounded-xl md:rounded-2xl h-11 md:h-12 px-4 shadow-xl">
                      <SelectValue placeholder="Все филиалы" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-white/10 rounded-2xl">
                      <SelectItem value="all" className="text-[10px] font-black uppercase tracking-widest py-3">Все филиалы</SelectItem>
                      {(Array.isArray(branches) ? branches : []).map((b: any) => (
                        <SelectItem key={b.id} value={b.id} className="text-[10px] font-black uppercase tracking-widest py-3">{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5 md:gap-2 min-w-[200px]">
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider text-white/30 ml-2">Команда</span>
                  <Select value={teamId} onValueChange={setTeamId}>
                    <SelectTrigger className="w-full bg-zinc-900 border-white/5 text-white rounded-xl md:rounded-2xl h-11 md:h-12 px-4 shadow-xl">
                      <SelectValue placeholder="Все команды" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-white/10 rounded-2xl">
                      <SelectItem value="all" className="text-[10px] font-black uppercase tracking-widest py-3">Все команды</SelectItem>
                      {(Array.isArray(teams) ? teams : []).map((t: any) => (
                        <SelectItem key={t.id} value={t.id} className="text-[10px] font-black uppercase tracking-widest py-3">{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5 md:gap-2 min-w-[150px]">
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider text-white/30 ml-2">Период</span>
                  <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
                    <SelectTrigger className="w-full bg-zinc-900 border-white/5 text-white rounded-xl md:rounded-2xl h-11 md:h-12 px-4 shadow-xl">
                      <SelectValue placeholder="Квартал" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-white/10 rounded-2xl">
                      <SelectItem value="month" className="text-[10px] font-black uppercase tracking-widest py-3">Месяц</SelectItem>
                      <SelectItem value="quarter" className="text-[10px] font-black uppercase tracking-widest py-3">Квартал</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2 min-w-[300px]">
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider text-white/30 ml-2">Режим отображения</span>
                  <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)} className="w-full">
                    <TabsList className="bg-zinc-900/60 border-white/5 h-12 md:h-14 p-1 rounded-2xl w-full xl:w-auto flex">
                      <TabsTrigger value="overview" className="flex-1 xl:min-w-[150px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-[10px] font-black uppercase tracking-wide h-full rounded-xl px-2 sm:px-6 transition-all duration-300">
                        <Layout className="h-3.5 w-4 mr-1.5 sm:mr-2" />
                        Общая
                      </TabsTrigger>
                      <TabsTrigger value="detailed" className="flex-1 xl:min-w-[150px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-[10px] font-black uppercase tracking-wide h-full rounded-xl px-2 sm:px-6 transition-all duration-300">
                        <Target className="h-3.5 w-4 mr-1.5 sm:mr-2" />
                        Подробная
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
            </div>
          </div>
        </div>

        {viewMode === 'overview' ? (
          <div className="space-y-6 md:space-y-8">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 lg:gap-6">
              {kpiCards.map((card, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                >
                  <Card className="bg-zinc-900/40 backdrop-blur-3xl border-white/5 overflow-hidden shadow-xl rounded-2xl md:rounded-[2rem] group hover:bg-zinc-900/60 transition-all duration-500 hover:scale-[1.02] border-t-white/10">
                    <CardHeader className="p-5 md:p-6 pb-2 md:pb-3 flex flex-row items-center justify-between space-y-0">
                      <div className="space-y-1">
                        <p className="text-[9px] md:text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">{card.label}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] md:text-[9px] font-black text-primary uppercase tracking-widest bg-primary/10 px-1.5 py-0.5 rounded-md">Итого:</span>
                          <div className={cn(
                            "flex items-center gap-1 text-[10px] font-bold",
                            card.trend.startsWith('+') ? "text-emerald-500" : "text-rose-500"
                          )}>
                            {card.trend}
                            {card.trend.startsWith('+') ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          </div>
                        </div>
                      </div>
                      <div className={cn("p-2.5 rounded-xl border transition-all duration-500", card.color, "bg-current/10 border-current/20 group-hover:scale-110 group-hover:rotate-3 shadow-lg shadow-current/5")}>
                        <card.icon className="h-4 w-4 md:h-5 md:w-5" />
                      </div>
                    </CardHeader>
                    <CardContent className="p-5 md:p-6 pt-0">
                      <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl md:text-5xl font-black text-white tracking-tighter tabular-nums leading-none">
                          {card.value.toLocaleString()}
                        </h3>
                        <span className="text-[10px] md:text-sm font-black text-white/20 uppercase tracking-widest">/ {card.target}</span>
                      </div>
                      <div className="mt-4 h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <motion.div 
                          className={cn("h-full rounded-full", card.color.replace('text-', 'bg-'))}
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min((card.value / (card.target || 1)) * 100, 100)}%` }}
                          transition={{ duration: 1, delay: idx * 0.1 }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Charts & Table Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
              {/* Chart */}
              <Card className="lg:col-span-8 bg-zinc-900/60 backdrop-blur-xl border-white/5 overflow-hidden shadow-2xl rounded-[1.5rem] md:rounded-[2.5rem]">
                <CardHeader className="p-6 md:p-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl md:text-2xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                        <BarChart3 className="h-6 w-6 text-primary" />
                        Активность системы
                      </CardTitle>
                      <p className="text-[10px] md:text-xs text-muted-foreground mt-1 font-bold uppercase tracking-widest">Динамика за последние 7 дней</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 md:p-8 pt-0">
                  <div className="h-[300px] w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                        <XAxis dataKey="dateLabel" stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} dy={10} />
                        <YAxis stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} dx={-10} />
                        <Tooltip content={<CustomTooltip />} cursor={{stroke: '#ffffff10', strokeWidth: 2}} />
                        <Area type="monotone" dataKey="deals" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorValue)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Leaders */}
              <Card className="lg:col-span-4 bg-zinc-900/60 backdrop-blur-xl border-white/5 overflow-hidden shadow-2xl rounded-[1.5rem] md:rounded-[2.5rem]">
                <CardHeader className="p-6 md:p-8">
                  <CardTitle className="text-xl md:text-2xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                    <Trophy className="h-6 w-6 text-amber-500" />
                    Лидеры
                  </CardTitle>
                  <p className="text-[10px] md:text-xs text-muted-foreground mt-1 font-bold uppercase tracking-widest text-white/40">Топ-5 сотрудников за период</p>
                </CardHeader>
                <CardContent className="p-6 md:p-8 pt-0 space-y-4">
                  {employeePerformance.slice(0, 5).map((emp, idx) => (
                    <div
                      key={emp.id}
                      onClick={() => accessLevel >= 50 && navigate(`/employees/${emp.id}`)}
                      className={cn(
                        "flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5 transition-all duration-300",
                        accessLevel >= 50 ? "hover:border-primary/30 cursor-pointer group" : ""
                      )}
                    >
                      <div className="relative">
                        <Avatar className="h-12 w-12 border border-white/10 rounded-xl overflow-hidden">
                          <AvatarImage src={getAvatarUrl(emp.avatar_url)} />
                          <AvatarFallback className="bg-zinc-800 text-white font-black">{emp.name?.substring(0, 1)}</AvatarFallback>
                        </Avatar>
                        <div className={cn(
                          "absolute -top-1.5 -left-1.5 w-6 h-6 rounded-lg flex items-center justify-center font-black text-[10px] z-10",
                          idx === 0 ? "bg-amber-500 text-white" : "bg-zinc-800 text-white/40"
                        )}>{idx + 1}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-black text-white truncate group-hover:text-primary transition-colors uppercase tracking-tight">{emp.name}</p>
                          <div className="flex items-center gap-1 shrink-0">
                            <Star className="h-2.5 w-2.5 text-amber-500 fill-amber-500" />
                            <span className="text-[11px] font-black text-white">{Number(emp.rating || 0).toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">{Number(emp.planPercent || 0).toFixed(0)}% плана</span>
                            <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${Math.min(emp.planPercent, 100)}%` }} />
                            </div>
                          </div>
                          <span className="text-[10px] font-black text-primary uppercase tracking-tighter">{emp.kpiRate}% KPI</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <DetailedAnalytics 
            performance={employeePerformance}
            kpis={kpis}
            aggregatedTargets={aggregatedTargets}
            isLoading={isLoading}
            period={period}
            currentPeriodLabel={currentPeriodLabel}
            prevPeriodLabel={prevPeriodLabel}
          />        )}
      </div>
    </MainLayout>
  );
}
