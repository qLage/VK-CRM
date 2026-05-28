import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MainLayout } from '@/components/layout/MainLayout';

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

export default function DealTeamsSummary() {
  const currentYear = new Date().getFullYear();

  const [filters, setFilters] = useState({
    year: currentYear,
    month: null
  });

  // Fetch teams for name mapping
  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/teams');
      if (error) throw error;
      return data;
    },
    staleTime: 300000
  });

  // Fetch teams summary
  const { data: summary, isLoading } = useQuery({
    queryKey: ['deal-teams-summary', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.year) params.append('year', filters.year);
      if (filters.month) params.append('month', filters.month);

      const { data, error } = await localAPI.request(`/deal-table/teams-summary?${params}`);
      if (error) throw error;
      return data;
    },
    staleTime: 30000
  });

  const getTeamName = (teamId: string) => {
    const team = teams?.find(t => t.id === teamId);
    return team?.name || 'Без команды';
  };

  const totalRevenue = summary?.reduce((sum, team) => sum + parseFloat(team.total_company_revenue || 0), 0) || 0;

  return (
    <MainLayout>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              Сводка по командам
            </h1>
            <p className="text-xs font-black text-white/20 uppercase tracking-widest mt-2">
              Агрегация доходов филиала
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <Select value={filters.year?.toString()} onValueChange={(v) => setFilters({ ...filters, year: parseInt(v) })}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Год" />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026].map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.month?.toString() || 'all'} onValueChange={(v) => setFilters({ ...filters, month: v === 'all' ? null : parseInt(v) })}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Месяц" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все месяцы</SelectItem>
              {MONTH_NAMES.map((name, idx) => (
                <SelectItem key={idx + 1} value={(idx + 1).toString()}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-xl p-6">
            <p className="text-xs font-black text-white/40 uppercase tracking-widest">Всего команд</p>
            <p className="text-3xl font-black text-white mt-2">{summary?.length || 0}</p>
          </div>

          <div className="bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-xl p-6">
            <p className="text-xs font-black text-white/40 uppercase tracking-widest">Всего сделок</p>
            <p className="text-3xl font-black text-white mt-2">
              {summary?.reduce((sum, team) => sum + parseInt(team.total_deals || 0), 0) || 0}
            </p>
          </div>

          <div className="bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-xl p-6">
            <p className="text-xs font-black text-white/40 uppercase tracking-widest">Выручка филиала</p>
            <p className="text-3xl font-black text-white mt-2">
              {totalRevenue.toFixed(2)} ₽
            </p>
          </div>
        </div>

        {/* Teams Table */}
        <div className="overflow-x-auto bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-black text-white/40 uppercase whitespace-nowrap">Команда</th>
                <th className="px-4 py-3 text-right text-xs font-black text-white/40 uppercase whitespace-nowrap">Сделок</th>
                <th className="px-4 py-3 text-right text-xs font-black text-white/40 uppercase whitespace-nowrap">Комиссия</th>
                <th className="px-4 py-3 text-right text-xs font-black text-white/40 uppercase whitespace-nowrap">Доход агентов</th>
                <th className="px-4 py-3 text-right text-xs font-black text-white/40 uppercase whitespace-nowrap bg-primary/10">Выручка АН</th>
                <th className="px-4 py-3 text-right text-xs font-black text-white/40 uppercase whitespace-nowrap">Средний чек</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-white/40">
                    Загрузка...
                  </td>
                </tr>
              ) : summary?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-white/40">
                    Нет данных
                  </td>
                </tr>
              ) : (
                summary?.map((team) => (
                  <tr key={team.team_id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 text-white font-semibold">{getTeamName(team.team_id)}</td>
                    <td className="px-4 py-3 text-right text-white/80">{team.total_deals}</td>
                    <td className="px-4 py-3 text-right text-white/80">{parseFloat(team.total_commission_fact || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-white/80">{parseFloat(team.total_agent_income || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-white font-bold bg-primary/5">
                      {parseFloat(team.total_company_revenue || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-white/80">{parseFloat(team.avg_check || 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
