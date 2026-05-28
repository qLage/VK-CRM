import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Building2, TrendingUp, CheckCircle2, Clock, XCircle, Globe, Award, Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { localAPI } from '@/integrations/localAPI';
import { useSharedData } from '@/hooks/useSharedData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useMemo } from 'react';
import { cn, getAvatarUrl } from '@/lib/utils';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface PropertyStats {
  totals: {
    total: number; drafts: number; pending: number; approved: number;
    rejected: number; published: number; sold: number; archived: number;
    avg_price: number | null;
  };
  by_status: Array<{ status: string; count: number }>;
  by_category: Array<{ category: string; count: number }>;
  by_branch: Array<{ id: string | null; name: string | null; total: number; approved: number; published: number; sold: number }>;
  top_realtors: Array<{ id: string; full_name: string; avatar_url: string | null; total: number; approved: number; published: number; sold: number }>;
  timeline: Array<{ day: string; created: number; approved: number }>;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:            { label: 'Черновики',   color: '#a1a1aa' },
  pending:          { label: 'На проверке',  color: '#fbbf24' },
  pending_approval: { label: 'На одобрении', color: '#fbbf24' },
  approved:         { label: 'Одобрены',    color: '#10b981' },
  rejected:         { label: 'Отклонены',   color: '#f43f5e' },
  avito_pending:    { label: 'Avito ожид.', color: '#3b82f6' },
  avito_approved:   { label: 'Avito одобр.', color: '#0ea5e9' },
  published_avito:  { label: 'Опубл. Avito', color: '#6366f1' },
  in_feed:          { label: 'Опубликован', color: '#818cf8' },
  archive_pending:  { label: 'В архив',     color: '#fb923c' },
  archived:         { label: 'Архив',       color: '#71717a' },
  transfer_pending: { label: 'Передача',    color: '#a855f7' },
  sold:             { label: 'Продан',      color: '#14b8a6' },
};

const CATEGORY_LABEL: Record<string, string> = {
  apartment: 'Квартиры',
  apartment_sell: 'Квартиры (продажа)',
  apartment_rent: 'Квартиры (аренда)',
  newbuilding: 'Новостройки',
  secondary: 'Вторичка',
  house: 'Дома',
  commercial: 'Коммерция',
  land: 'Земля',
  rent: 'Аренда',
  garage: 'Гаражи',
  room: 'Комнаты',
  townhouse: 'Таунхаусы',
  office: 'Офисы',
};

export function PropertyAnalytics() {
  const { branches } = useSharedData();
  const [branchId, setBranchId] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['property-stats', branchId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (branchId !== 'all') params.set('branch_id', branchId);
      const { data: r } = await localAPI.request(`/properties/stats/summary?${params.toString()}`);
      return r as PropertyStats;
    },
    staleTime: 60_000,
  });

  const totals = data?.totals;
  const conversionApproved = useMemo(() => {
    if (!totals?.total) return 0;
    return Math.round(((totals.approved + totals.published + totals.sold) / totals.total) * 100);
  }, [totals]);
  const conversionPublished = useMemo(() => {
    if (!totals?.total) return 0;
    return Math.round((totals.published / totals.total) * 100);
  }, [totals]);
  const conversionSold = useMemo(() => {
    if (!totals?.total) return 0;
    return Math.round((totals.sold / totals.total) * 100);
  }, [totals]);

  const cards = [
    { label: 'Всего объектов', value: totals?.total ?? 0, icon: Building2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { label: 'Одобренные',     value: totals?.approved ?? 0, icon: CheckCircle2, color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { label: 'На Avito',       value: totals?.published ?? 0, icon: Globe, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
    { label: 'Продано',        value: totals?.sold ?? 0, icon: Award, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
  ];

  const conversion = [
    { label: 'Одобрение', value: conversionApproved, color: 'bg-emerald-500' },
    { label: 'Публикация Avito', value: conversionPublished, color: 'bg-indigo-500' },
    { label: 'Продажа', value: conversionSold, color: 'bg-teal-500' },
  ];

  const statusChartData = (data?.by_status || []).map(s => ({
    ...s,
    label: STATUS_LABEL[s.status]?.label || s.status,
    color: STATUS_LABEL[s.status]?.color || '#71717a',
  }));

  const timelineData = (data?.timeline || []).map(d => ({
    ...d,
    dateLabel: format(new Date(d.day), 'd MMM', { locale: ru }),
  }));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger className="w-[240px] bg-zinc-900/60 border-white/5 h-11 rounded-xl text-[11px] font-black uppercase tracking-wider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-white/10">
            <SelectItem value="all" className="text-[11px] font-black uppercase tracking-wider">Все филиалы</SelectItem>
            {branches.map((b: any) => (
              <SelectItem key={b.id} value={b.id} className="text-[11px] font-black uppercase tracking-wider">{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="bg-zinc-900/40 backdrop-blur-3xl border-white/5 overflow-hidden shadow-xl rounded-2xl md:rounded-[2rem]">
              <CardContent className="p-5 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[9px] md:text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">{c.label}</p>
                  <div className={cn("p-2 rounded-xl border", c.bg, c.border)}>
                    <c.icon className={cn("h-4 w-4", c.color)} />
                  </div>
                </div>
                <h3 className="text-3xl md:text-5xl font-black text-white tracking-tighter tabular-nums leading-none">
                  {c.value.toLocaleString('ru-RU')}
                </h3>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Conversion */}
      <Card className="bg-zinc-900/40 backdrop-blur-3xl border-white/5 rounded-2xl md:rounded-[2rem] overflow-hidden">
        <CardHeader className="p-5 md:p-6 pb-3">
          <CardTitle className="text-[10px] md:text-xs font-black uppercase tracking-widest text-white/60 flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> Воронка конверсии
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 md:p-6 pt-0 space-y-3">
          {conversion.map(c => (
            <div key={c.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">{c.label}</span>
                <span className="text-sm font-black text-white tabular-nums">{c.value}%</span>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                <motion.div className={cn("h-full rounded-full", c.color)} initial={{ width: 0 }} animate={{ width: `${c.value}%` }} transition={{ duration: 0.8 }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Timeline */}
      {timelineData.length > 0 && (
        <Card className="bg-zinc-900/40 backdrop-blur-3xl border-white/5 rounded-2xl md:rounded-[2rem] overflow-hidden">
          <CardHeader className="p-5 md:p-6 pb-3">
            <CardTitle className="text-[10px] md:text-xs font-black uppercase tracking-widest text-white/60">
              Динамика создания объектов
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 md:p-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData}>
                  <defs>
                    <linearGradient id="created" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="dateLabel" stroke="rgba(255,255,255,0.3)" fontSize={10} />
                  <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(24,24,27,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
                    labelStyle={{ color: 'rgba(255,255,255,0.9)' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="created" stroke="#10b981" fillOpacity={1} fill="url(#created)" name="Создано" />
                  <Area type="monotone" dataKey="approved" stroke="#6366f1" fill="transparent" name="Одобрено" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status & Category breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-zinc-900/40 backdrop-blur-3xl border-white/5 rounded-2xl md:rounded-[2rem] overflow-hidden">
          <CardHeader className="p-5 md:p-6 pb-3">
            <CardTitle className="text-[10px] md:text-xs font-black uppercase tracking-widest text-white/60 flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-amber-400" /> Распределение по статусам
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 md:p-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusChartData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" stroke="rgba(255,255,255,0.3)" fontSize={10} />
                  <YAxis type="category" dataKey="label" stroke="rgba(255,255,255,0.5)" fontSize={10} width={80} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(24,24,27,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
                    labelStyle={{ color: 'rgba(255,255,255,0.9)' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="count" name="Объектов" radius={[0, 6, 6, 0]}>
                    {statusChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/40 backdrop-blur-3xl border-white/5 rounded-2xl md:rounded-[2rem] overflow-hidden">
          <CardHeader className="p-5 md:p-6 pb-3">
            <CardTitle className="text-[10px] md:text-xs font-black uppercase tracking-widest text-white/60">
              По категориям
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 md:p-6 pt-0 space-y-2.5">
            {(data?.by_category || []).map(c => {
              const categoryTotal = (data?.by_category || []).reduce((sum, item) => sum + Number(item.count || 0), 0) || 1;
              const pct = Math.round((c.count / categoryTotal) * 100);
              return (
                <div key={c.category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">
                      {CATEGORY_LABEL[String(c.category || '').toLowerCase()] || c.category}
                    </span>
                    <span className="text-xs font-black text-white tabular-nums">{c.count} <span className="text-white/30">/ {pct}%</span></span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <motion.div className="h-full rounded-full bg-emerald-500/70" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
                  </div>
                </div>
              );
            })}
            {(data?.by_category || []).length === 0 && (
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest text-center py-8">Нет данных</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Realtors */}
      <Card className="bg-zinc-900/40 backdrop-blur-3xl border-white/5 rounded-2xl md:rounded-[2rem] overflow-hidden">
        <CardHeader className="p-5 md:p-6 pb-3">
          <CardTitle className="text-[10px] md:text-xs font-black uppercase tracking-widest text-white/60 flex items-center gap-2">
            <Award className="h-3.5 w-3.5 text-amber-400" /> Топ риелторов по объектам
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 md:p-4">
          <div className="space-y-2">
            {(data?.top_realtors || []).map((r, i) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
                <div className="text-[10px] font-black text-white/30 tabular-nums w-5 text-center">#{i + 1}</div>
                <Avatar className="h-9 w-9">
                  <AvatarImage src={getAvatarUrl(r.avatar_url)} />
                  <AvatarFallback className="bg-zinc-800 text-white/60 text-[10px] font-black">{(r.full_name || '?').slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm font-bold text-white truncate">{r.full_name || 'Без имени'}</p>
                  <p className="text-[9px] text-white/40 font-black uppercase tracking-widest mt-0.5">
                    Всего: {r.total} · Одобр.: {r.approved} · Avito: {r.published} · Продано: {r.sold}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-emerald-400 tabular-nums leading-none">{r.approved}</p>
                  <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mt-0.5">одобрено</p>
                </div>
              </div>
            ))}
            {(data?.top_realtors || []).length === 0 && (
              <p className="text-[10px] font-black text-white/30 uppercase tracking-widest text-center py-8">Нет данных</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* By Branch */}
      {(data?.by_branch || []).length > 0 && (
        <Card className="bg-zinc-900/40 backdrop-blur-3xl border-white/5 rounded-2xl md:rounded-[2rem] overflow-hidden">
          <CardHeader className="p-5 md:p-6 pb-3">
            <CardTitle className="text-[10px] md:text-xs font-black uppercase tracking-widest text-white/60">
              Сводка по филиалам
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 md:p-4">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[9px] font-black text-white/30 uppercase tracking-widest">
                    <th className="text-left p-2">Филиал</th>
                    <th className="text-right p-2">Всего</th>
                    <th className="text-right p-2">Одобр.</th>
                    <th className="text-right p-2">Avito</th>
                    <th className="text-right p-2">Продано</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.by_branch.map(b => (
                    <tr key={b.id || 'none'} className="border-t border-white/5 text-xs font-bold tabular-nums">
                      <td className="p-2 text-white">{b.name || '—'}</td>
                      <td className="p-2 text-right text-white">{b.total}</td>
                      <td className="p-2 text-right text-emerald-400">{b.approved}</td>
                      <td className="p-2 text-right text-indigo-400">{b.published}</td>
                      <td className="p-2 text-right text-teal-400">{b.sold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
