import { motion } from 'framer-motion';
import { Users, Trophy, TrendingUp, Award, Target, Briefcase, Coins } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn, getAvatarUrl } from '@/lib/utils';
import { useMemo } from 'react';

interface Employee {
  id: string;
  full_name: string;
  personal_kpi_current?: number;
  commission_percent?: number;
  avatar_url?: string;
  team_id?: string;
  custom_total_deals?: number;
  custom_total_revenue?: number;
}

interface TeamComparisonProps {
  employee: Employee;
  allEmployees: Employee[];
}

interface TeamMember {
  id: string;
  name: string;
  avatar?: string;
  efficiency: number;
  deals: number;
  revenue: number;
  rank: number;
}

// Generate team comparison data
const generateTeamData = (employee: Employee, allEmployees: Employee[]): TeamMember[] => {
  // Filter team members (same team_id or all if no team)
  const employeesArray = Array.isArray(allEmployees) ? allEmployees : [];
  const teamMembers = employeesArray
    .filter(emp => emp?.team_id === employee?.team_id || !employee?.team_id)
    .map(emp => ({
      id: emp.id,
      name: emp.full_name,
      avatar: emp.avatar_url,
      efficiency: emp.personal_kpi_current ?? 0,
      deals: (emp as any).deal_count ?? 0,
      revenue: (emp as any).total_revenue ?? 0,
      rank: 0,
    }))
    .sort((a, b) => {
      if (b.efficiency !== a.efficiency) return b.efficiency - a.efficiency;
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      return b.deals - a.deals;
    });

  // Assign ranks
  teamMembers.forEach((member, index) => {
    member.rank = index + 1;
  });

  return teamMembers;
};

export function TeamComparison({ employee, allEmployees }: TeamComparisonProps) {
  const teamData = useMemo(() => generateTeamData(employee, allEmployees), [employee, allEmployees]);
  const currentEmployee = teamData.find(m => m.id === employee.id);
  const teamSize = teamData.length;
  const currentRank = currentEmployee?.rank || 0;

  // Calculate team averages with division by zero checks
  const avgEfficiency = teamSize > 0
    ? Math.round(teamData.reduce((sum, m) => sum + (Number(m.efficiency) || 0), 0) / teamSize)
    : 0;
  const avgDeals = teamSize > 0
    ? Math.round(teamData.reduce((sum, m) => sum + (Number(m.deals) || 0), 0) / teamSize)
    : 0;
  const avgRevenue = teamSize > 0
    ? Math.round(teamData.reduce((sum, m) => sum + (Number(m.revenue) || 0), 0) / teamSize)
    : 0;

  // Top 5 performers
  const topPerformers = teamData.slice(0, 5);

  // Performance vs team average
  const currentEfficiency = Number(employee.personal_kpi_current) || 0;
  const efficiencyDiff = currentEfficiency - avgEfficiency;
  const dealsDiff = (Number(currentEmployee?.deals) || 0) - avgDeals;
  const revenueDiff = (Number(currentEmployee?.revenue) || 0) - avgRevenue;

  const formatShortValue = (val: number) => {
    if (!isFinite(val)) return '0';
    const absVal = Math.abs(val);
    if (absVal >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (absVal >= 1000) return `${(val / 1000).toFixed(0)}k`;
    return val.toString();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="rounded-xl md:rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-4 sm:p-6 md:p-8 shadow-2xl w-full h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 md:p-2.5 rounded-lg md:rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Users className="h-4 w-4 md:h-5 md:w-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl md:text-2xl font-black text-white uppercase tracking-tight">
              Сравнение с командой
            </h2>
            <p className="text-[9px] md:text-[10px] font-bold text-white/40 uppercase tracking-wider mt-0.5">
              Позиция в рейтинге
            </p>
          </div>
        </div>
      </div>

      {/* Current Rank Card */}
      <div className="mb-6 md:mb-8 p-4 md:p-6 rounded-xl md:rounded-2xl bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-500/30 rounded-xl blur-xl animate-pulse" />
              <div className="relative p-3 md:p-4 rounded-xl bg-blue-500/20 border border-blue-500/30">
                <Trophy className="h-6 w-6 md:h-8 md:w-8 text-blue-400" />
              </div>
            </div>
            <div>
              <p className="text-[9px] md:text-[10px] font-black text-white/40 uppercase tracking-wider mb-1">
                Ваша позиция
              </p>
              <p className="text-3xl md:text-4xl font-black text-white tabular-nums">
                #{currentRank}
                <span className="text-lg md:text-xl text-white/40 ml-2">из {teamSize}</span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9px] md:text-[10px] font-black text-white/40 uppercase tracking-wider mb-1">
              Личный KPI
            </p>
            <p className="text-2xl md:text-3xl font-black text-blue-400 tabular-nums">
              {Math.round(currentEfficiency)}%
            </p>
          </div>
        </div>
      </div>

      {/* Performance vs Team Average */}
      <div className="mb-6 md:mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-4 w-4 text-white/60" />
          <h3 className="text-sm md:text-base font-black text-white uppercase tracking-tight">
            Сравнение со средними показателями
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {/* Efficiency */}
          <div className="p-3 md:p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <p className="text-[8px] md:text-[9px] font-black text-white/30 uppercase tracking-wider mb-2">
              Эффективность
            </p>
            <div className="flex items-baseline gap-2 mb-2">
              <p className="text-xl md:text-2xl font-black text-white tabular-nums">
                {Math.round(currentEfficiency)}%
              </p>
              <p className={cn(
                "text-sm md:text-base font-black tabular-nums",
                efficiencyDiff >= 0 ? "text-green-400" : "text-red-400"
              )}>
                {efficiencyDiff >= 0 ? '+' : ''}{Math.round(efficiencyDiff)}
              </p>
            </div>
            <p className="text-[9px] md:text-[10px] font-bold text-white/20">
              Средняя: {avgEfficiency}%
            </p>
          </div>

          {/* Deals */}
          <div className="p-3 md:p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <p className="text-[8px] md:text-[9px] font-black text-white/30 uppercase tracking-wider mb-2">
              Сделки
            </p>
            <div className="flex items-baseline gap-2 mb-2">
              <p className="text-xl md:text-2xl font-black text-white tabular-nums">
                {currentEmployee?.deals || 0}
              </p>
              <p className={cn(
                "text-sm md:text-base font-black tabular-nums",
                dealsDiff >= 0 ? "text-green-400" : "text-red-400"
              )}>
                {dealsDiff >= 0 ? '+' : ''}{dealsDiff}
              </p>
            </div>
            <p className="text-[9px] md:text-[10px] font-bold text-white/20">
              Средняя: {avgDeals}
            </p>
          </div>

          {/* Revenue */}
          <div className="p-3 md:p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <p className="text-[8px] md:text-[9px] font-black text-white/30 uppercase tracking-wider mb-2">
              Выручка
            </p>
            <div className="flex items-baseline gap-2 mb-2">
              <p className="text-xl md:text-2xl font-black text-white tabular-nums">
                {formatShortValue(currentEmployee?.revenue || 0)}
              </p>
              <p className={cn(
                "text-sm md:text-base font-black tabular-nums",
                revenueDiff >= 0 ? "text-green-400" : "text-red-400"
              )}>
                {revenueDiff >= 0 ? '+' : ''}{formatShortValue(revenueDiff)}
              </p>
            </div>
            <p className="text-[9px] md:text-[10px] font-bold text-white/20">
              Средняя: {formatShortValue(avgRevenue)}
            </p>
          </div>
        </div>
      </div>

      {/* Top Performers Leaderboard */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-4">
          <Award className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm md:text-base font-black text-white uppercase tracking-tight">
            Топ-5 команды
          </h3>
        </div>

        <div className="space-y-2 md:space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {topPerformers.map((member, index) => {
            const isCurrentUser = member.id === employee.id;
            const rankColors = [
              'bg-amber-500/20 border-amber-500/30 text-amber-400',
              'bg-zinc-400/20 border-zinc-400/30 text-zinc-300',
              'bg-amber-700/20 border-amber-700/30 text-amber-600',
            ];

            return (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className={cn(
                  'flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-4 rounded-2xl border transition-all relative overflow-hidden group',
                  isCurrentUser
                    ? 'bg-primary/10 border-primary/20 shadow-lg shadow-primary/5'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10'
                )}
              >
                {/* Background Accent for Current User */}
                {isCurrentUser && (
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                )}

                <div className="flex items-center gap-3 md:gap-4 flex-1">
                  {/* Rank Badge */}
                  <div className={cn(
                    'shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-xl border flex items-center justify-center font-black text-sm md:text-base shadow-inner',
                    index < 3 ? rankColors[index] : 'bg-zinc-800/50 border-white/5 text-white/40'
                  )}>
                    {member.rank}
                  </div>

                  {/* Avatar Case */}
                  <div className="relative shrink-0">
                    <Avatar className="h-10 w-10 md:h-12 md:w-12 rounded-xl border-2 border-white/10 shadow-xl group-hover:scale-105 transition-transform duration-300">
                      <AvatarImage src={getAvatarUrl(member.avatar)} className="object-cover" />
                      <AvatarFallback className="bg-zinc-800 text-white/40 font-black text-xs rounded-xl uppercase">
                        {member.name && member.name.length >= 2 ? member.name.substring(0, 2) : 'NA'}
                      </AvatarFallback>
                    </Avatar>
                    {index === 0 && (
                      <div className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-amber-500 shadow-lg border border-zinc-950">
                        <Trophy className="h-2.5 w-2.5 text-zinc-950" />
                      </div>
                    )}
                  </div>

                  {/* Info Group */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <p className={cn(
                        'text-sm md:text-base font-black leading-tight mb-0.5 capitalize',
                        isCurrentUser ? 'text-primary' : 'text-zinc-100'
                      )}>
                        {member.name}
                      </p>
                      {isCurrentUser && (
                        <Badge variant="outline" className="h-4 px-1.5 bg-primary/20 text-primary border-primary/30 text-[8px] font-black uppercase tracking-tighter">
                          ВЫ
                        </Badge>
                      )}
                    </div>
                    
                    {/* All Metrics Comparison Row */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                      <div className="flex items-center gap-1.5 group/stat">
                        <div className="p-1 rounded bg-white/5 border border-white/5 group-hover/stat:bg-blue-500/10 group-hover/stat:border-blue-500/20 transition-colors">
                          <Briefcase className="h-2.5 w-2.5 text-blue-400/70" />
                        </div>
                        <span className="text-[10px] font-bold text-white/50 tabular-nums">
                          {member.deals} <span className="text-[8px] font-medium text-white/20 uppercase tracking-tighter">сдел.</span>
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 group/stat text-emerald-400/80">
                        <div className="p-1 rounded bg-white/5 border border-white/5 group-hover/stat:bg-emerald-500/10 group-hover/stat:border-emerald-500/20 transition-colors">
                          <Coins className="h-2.5 w-2.5 text-emerald-400/70" />
                        </div>
                        <span className="text-[10px] font-bold text-white/50 tabular-nums">
                          {formatShortValue(member.revenue)} <span className="text-[8px] font-medium text-white/20 uppercase tracking-tighter">₽</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Efficiency Highlight */}
                <div className="flex items-center justify-between md:flex-col md:items-end md:justify-center border-t md:border-t-0 md:border-l border-white/5 pt-3 md:pt-0 md:pl-4 mt-1 md:mt-0 shrink-0">
                  <div className="md:hidden flex items-center gap-1.5">
                    <TrendingUp className="h-3 w-3 text-primary/60" />
                    <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Эффективность</span>
                  </div>
                  <div className="bg-primary/5 px-2 py-1 rounded-lg border border-primary/10">
                    <p className="text-xl md:text-2xl font-black text-primary tabular-nums leading-none">
                      {Math.round(member.efficiency)}%
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
